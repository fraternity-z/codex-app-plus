param(
    [Parameter(Mandatory = $false)]
    [string]$OperationPath,
    [switch]$Worker
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class OCUWin32 {
    private const UInt32 INPUT_KEYBOARD = 1;
    private const UInt32 KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const UInt32 KEYEVENTF_KEYUP = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public UInt32 type;
        public INPUTUNION U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public UInt16 wVk;
        public UInt16 wScan;
        public UInt32 dwFlags;
        public UInt32 time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr SetActiveWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern UInt32 GetWindowThreadProcessId(IntPtr hWnd, out int processId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(UInt32 idAttach, UInt32 idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern UInt32 GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool PostMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, string lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(UInt32 dwFlags, bool fInherit, UInt32 dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    public static void SendKeyboardChord(UInt16[] virtualKeys) {
        if (virtualKeys == null || virtualKeys.Length == 0) {
            throw new ArgumentException("No virtual keys were provided.", "virtualKeys");
        }

        INPUT[] inputs = new INPUT[virtualKeys.Length * 2];
        int index = 0;
        for (int i = 0; i < virtualKeys.Length; i++) {
            inputs[index++] = CreateKeyboardInput(virtualKeys[i], false);
        }
        for (int i = virtualKeys.Length - 1; i >= 0; i--) {
            inputs[index++] = CreateKeyboardInput(virtualKeys[i], true);
        }

        UInt32 sent = SendInput((UInt32)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != (UInt32)inputs.Length) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "SendInput did not send the complete keyboard chord.");
        }
    }

    private static INPUT CreateKeyboardInput(UInt16 virtualKey, bool keyUp) {
        UInt32 flags = keyUp ? KEYEVENTF_KEYUP : 0;
        if (IsExtendedKey(virtualKey)) {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }

        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki.wVk = virtualKey;
        input.U.ki.wScan = 0;
        input.U.ki.dwFlags = flags;
        input.U.ki.time = 0;
        input.U.ki.dwExtraInfo = IntPtr.Zero;
        return input;
    }

    private static bool IsExtendedKey(UInt16 virtualKey) {
        switch (virtualKey) {
            case 0x21:
            case 0x22:
            case 0x23:
            case 0x24:
            case 0x25:
            case 0x26:
            case 0x27:
            case 0x28:
            case 0x2D:
            case 0x2E:
            case 0x5B:
            case 0x5C:
            case 0xA3:
            case 0xA5:
                return true;
            default:
                return false;
        }
    }
}
"@

$WM_SETTEXT = 0x000C
$WM_MOUSEMOVE = 0x0200
$WM_LBUTTONDOWN = 0x0201
$WM_LBUTTONUP = 0x0202
$WM_RBUTTONDOWN = 0x0204
$WM_RBUTTONUP = 0x0205
$WM_MBUTTONDOWN = 0x0207
$WM_MBUTTONUP = 0x0208
$WM_MOUSEWHEEL = 0x020A
$WM_MOUSEHWHEEL = 0x020E
$WM_KEYDOWN = 0x0100
$WM_KEYUP = 0x0101
$WM_CHAR = 0x0102
$WM_PASTE = 0x0302
$EM_SETSEL = 0x00B1
$EM_REPLACESEL = 0x00C2
$SW_RESTORE = 9
$DESKTOP_READOBJECTS = 0x0001
$UOI_NAME = 2
$script:ExplicitlyActivatedPids = @{}

function Test-EnvFlagEnabled([string]$name) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }
    $normalized = $value.Trim().ToLowerInvariant()
    return @("1", "true", "yes", "on") -contains $normalized
}

function New-Frame($x, $y, $width, $height) {
    if ($width -lt 0 -or $height -lt 0) {
        return $null
    }
    [pscustomobject]@{
        x = [double]$x
        y = [double]$y
        width = [double]$width
        height = [double]$height
    }
}

function ConvertTo-LParam([int]$x, [int]$y) {
    $packed = (($y -band 0xffff) -shl 16) -bor ($x -band 0xffff)
    [IntPtr]$packed
}

function ConvertTo-WheelWParam([int]$delta) {
    $packed = (($delta -band 0xffff) -shl 16)
    [IntPtr]$packed
}

function Get-WindowRectFrame([IntPtr]$hwnd) {
    $rect = New-Object OCUWin32+RECT
    if ([OCUWin32]::GetWindowRect($hwnd, [ref]$rect)) {
        return New-Frame $rect.Left $rect.Top ($rect.Right - $rect.Left) ($rect.Bottom - $rect.Top)
    }
    return $null
}

function Get-ElementFrame($element, $windowBounds) {
    try {
        $rect = $element.Current.BoundingRectangle
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) {
            return $null
        }
        if ($null -ne $windowBounds) {
            return New-Frame ($rect.X - $windowBounds.x) ($rect.Y - $windowBounds.y) $rect.Width $rect.Height
        }
        return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
    } catch {
        return $null
    }
}

function Get-ScreenPoint($localFrame, $windowBounds) {
    if ($null -eq $localFrame -or $null -eq $windowBounds) {
        return $null
    }
    [pscustomobject]@{
        x = [int][math]::Round($windowBounds.x + $localFrame.x + ($localFrame.width / 2))
        y = [int][math]::Round($windowBounds.y + $localFrame.y + ($localFrame.height / 2))
    }
}

function Send-MouseClick([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$button, [int]$count) {
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y

    $down = $WM_LBUTTONDOWN
    $up = $WM_LBUTTONUP
    $downFlag = 0x0001
    if ($button -eq "right") {
        $down = $WM_RBUTTONDOWN
        $up = $WM_RBUTTONUP
        $downFlag = 0x0002
    } elseif ($button -eq "middle") {
        $down = $WM_MBUTTONDOWN
        $up = $WM_MBUTTONUP
        $downFlag = 0x0010
    }

    $repeat = [math]::Max(1, $count)
    for ($i = 0; $i -lt $repeat; $i++) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $lParam)
        [void][OCUWin32]::PostMessage($hwnd, $down, [IntPtr]$downFlag, $lParam)
        Start-Sleep -Milliseconds 35
        [void][OCUWin32]::PostMessage($hwnd, $up, [IntPtr]::Zero, $lParam)
        Start-Sleep -Milliseconds 50
    }
}

function Send-Drag([IntPtr]$hwnd, [int]$fromX, [int]$fromY, [int]$toX, [int]$toY) {
    $start = New-Object OCUWin32+POINT
    $start.X = $fromX
    $start.Y = $fromY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$start)
    $end = New-Object OCUWin32+POINT
    $end.X = $toX
    $end.Y = $toY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$end)

    $steps = 12
    $startParam = ConvertTo-LParam $start.X $start.Y
    [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $startParam)
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONDOWN, [IntPtr]1, $startParam)
    for ($i = 1; $i -le $steps; $i++) {
        $x = [int][math]::Round($start.X + (($end.X - $start.X) * $i / $steps))
        $y = [int][math]::Round($start.Y + (($end.Y - $start.Y) * $i / $steps))
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]1, (ConvertTo-LParam $x $y))
        Start-Sleep -Milliseconds 20
    }
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONUP, [IntPtr]::Zero, (ConvertTo-LParam $end.X $end.Y))
}

function Send-Scroll([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$direction, [double]$pages) {
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y
    $delta = [int][math]::Round(120 * $pages)
    $message = $WM_MOUSEWHEEL
    if ($direction -eq "down" -or $direction -eq "right") {
        $delta = -1 * $delta
    }
    if ($direction -eq "left" -or $direction -eq "right") {
        $message = $WM_MOUSEHWHEEL
    }
    [void][OCUWin32]::PostMessage($hwnd, $message, (ConvertTo-WheelWParam $delta), $lParam)
}

function Send-Text([IntPtr]$hwnd, [string]$text) {
    foreach ($char in $text.ToCharArray()) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_CHAR, [IntPtr][int][char]$char, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 8
    }
}

function Send-TextToEditHandle([IntPtr]$hwnd, [string]$text, $element) {
    if ($hwnd -eq [IntPtr]::Zero) {
        return $false
    }

    try {
        [void][OCUWin32]::SendMessage($hwnd, $EM_SETSEL, [IntPtr](-1), [IntPtr](-1))
        [void][OCUWin32]::SendMessage($hwnd, $EM_REPLACESEL, [IntPtr]1, $text)
        return $true
    } catch {
    }

    try {
        $current = ""
        if ($null -ne $element) {
            $current = Get-ElementValue $element
        }
        [void][OCUWin32]::SendMessage($hwnd, $WM_SETTEXT, [IntPtr]::Zero, ($current + $text))
        return $true
    } catch {
        return $false
    }
}

function Get-VirtualKey([string]$key) {
    $normalized = $key.ToLowerInvariant()
    $map = @{
        "return" = 0x0D; "enter" = 0x0D; "tab" = 0x09; "escape" = 0x1B; "esc" = 0x1B
        "backspace" = 0x08; "back_space" = 0x08; "delete" = 0x2E; "space" = 0x20
        "left" = 0x25; "up" = 0x26; "right" = 0x27; "down" = 0x28
        "home" = 0x24; "end" = 0x23; "page_up" = 0x21; "prior" = 0x21; "page_down" = 0x22; "next" = 0x22
    }
    if ($map.ContainsKey($normalized)) {
        return $map[$normalized]
    }
    if ($normalized -match "^f([1-9]|1[0-2])$") {
        return 0x70 + [int]$Matches[1] - 1
    }
    if ($normalized -match "^kp_([0-9])$") {
        return 0x60 + [int]$Matches[1]
    }
    if ($normalized.Length -eq 1) {
        $code = [int][char]$normalized.ToUpperInvariant()[0]
        if (($code -ge 0x30 -and $code -le 0x39) -or ($code -ge 0x41 -and $code -le 0x5A)) {
            return $code
        }
    }
    throw "Unsupported key: $key"
}

function Get-InputDesktopName {
    $desktop = [OCUWin32]::OpenInputDesktop(0, $false, $DESKTOP_READOBJECTS)
    if ($desktop -eq [IntPtr]::Zero) {
        return $null
    }
    try {
        $needed = 0
        $buffer = New-Object System.Text.StringBuilder 256
        if (-not [OCUWin32]::GetUserObjectInformation($desktop, $UOI_NAME, $buffer, $buffer.Capacity, [ref]$needed)) {
            return $null
        }
        return $buffer.ToString()
    } finally {
        [void][OCUWin32]::CloseDesktop($desktop)
    }
}

function Assert-InteractiveDesktop {
    if (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_NON_DEFAULT_DESKTOP") {
        return
    }
    $desktopName = Get-InputDesktopName
    if ($desktopName -ne "Default") {
        if ([string]::IsNullOrWhiteSpace($desktopName)) {
            throw "Computer Use blocked desktop access because the interactive desktop is unavailable or locked. Unlock the signed-in desktop before using Computer Use."
        }
        throw "Computer Use blocked desktop access because the active input desktop is '$desktopName', not 'Default'. Unlock the signed-in desktop or dismiss secure Windows prompts before using Computer Use."
    }
}

function Get-ModifierVirtualKey([string]$modifier) {
    switch ($modifier.Trim().ToLowerInvariant()) {
        "ctrl" { return 0x11 }
        "control" { return 0x11 }
        "ctrl_l" { return 0x11 }
        "ctrl_r" { return 0x11 }
        "control_l" { return 0x11 }
        "control_r" { return 0x11 }
        "shift" { return 0x10 }
        "shift_l" { return 0x10 }
        "shift_r" { return 0x10 }
        "alt" { return 0x12 }
        "alt_l" { return 0x12 }
        "alt_r" { return 0x12 }
        "super" { return 0x5B }
        "super_l" { return 0x5B }
        "super_r" { return 0x5B }
        "win" { return 0x5B }
        "win_l" { return 0x5B }
        "win_r" { return 0x5B }
        "cmd" { return 0x5B }
        "cmd_l" { return 0x5B }
        "cmd_r" { return 0x5B }
        default {
            throw "Unsupported key modifier: $modifier"
        }
    }
}

function ConvertTo-KeyChord([string]$key) {
    $parts = @($key -split "\+")
    if ($parts.Count -eq 0) {
        throw "Unsupported key: $key"
    }

    $main = $parts[$parts.Length - 1].Trim()
    if ([string]::IsNullOrWhiteSpace($main)) {
        throw "Unsupported key: $key"
    }

    $modifiers = @()
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        $modifiers += Get-ModifierVirtualKey $parts[$i]
    }

    [pscustomobject]@{
        modifiers = $modifiers
        main = Get-VirtualKey $main
    }
}

function Test-ProcessForeground($process) {
    $foreground = [OCUWin32]::GetForegroundWindow()
    if ($foreground -eq [IntPtr]::Zero) {
        return $false
    }

    $foregroundPid = 0
    [void][OCUWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
    return $foregroundPid -eq $process.Id
}

function Ensure-KeyboardInputTarget($process, [IntPtr]$hwnd) {
    if (Test-ProcessForeground $process) {
        return $true
    }

    if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS")) {
        return $false
    }

    [void][OCUWin32]::SetForegroundWindow($hwnd)
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 50
        if (Test-ProcessForeground $process) {
            return $true
        }
    }
    return $false
}

function Activate-AppWindow($process, [IntPtr]$hwnd) {
    if ($hwnd -eq [IntPtr]::Zero) {
        throw "Cannot activate $($process.ProcessName) because it has no main window handle."
    }
    $targetPid = 0
    $targetThread = [OCUWin32]::GetWindowThreadProcessId($hwnd, [ref]$targetPid)
    $foreground = [OCUWin32]::GetForegroundWindow()
    $foregroundPid = 0
    $foregroundThread = 0
    if ($foreground -ne [IntPtr]::Zero) {
        $foregroundThread = [OCUWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
    }
    $currentThread = [OCUWin32]::GetCurrentThreadId()
    $attachedTarget = $false
    $attachedForeground = $false
    try {
        if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
            $attachedTarget = [OCUWin32]::AttachThreadInput($currentThread, $targetThread, $true)
        }
        if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and $foregroundThread -ne $targetThread) {
            $attachedForeground = [OCUWin32]::AttachThreadInput($currentThread, $foregroundThread, $true)
        }
        if ([OCUWin32]::IsIconic($hwnd)) {
            [void][OCUWin32]::ShowWindow($hwnd, $SW_RESTORE)
            Start-Sleep -Milliseconds 80
        }
        [void][OCUWin32]::BringWindowToTop($hwnd)
        [void][OCUWin32]::SetForegroundWindow($hwnd)
        [void][OCUWin32]::SetActiveWindow($hwnd)
        [void][OCUWin32]::SetFocus($hwnd)
    } finally {
        if ($attachedForeground) {
            [void][OCUWin32]::AttachThreadInput($currentThread, $foregroundThread, $false)
        }
        if ($attachedTarget) {
            [void][OCUWin32]::AttachThreadInput($currentThread, $targetThread, $false)
        }
    }
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Milliseconds 50
        if (Test-ProcessForeground $process) {
            return
        }
    }
    throw "Could not activate $($process.ProcessName). Windows may have refused the foreground change."
}

function Send-PostedKey([IntPtr]$hwnd, $chord) {
    foreach ($modifier in $chord.modifiers) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$modifier, [IntPtr]::Zero)
    }
    $vk = $chord.main
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$vk, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 25
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$vk, [IntPtr]::Zero)
    for ($i = $chord.modifiers.Count - 1; $i -ge 0; $i--) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$chord.modifiers[$i], [IntPtr]::Zero)
    }
}

function Send-KeyChordWithInput($chord) {
    $keys = [UInt16[]]::new($chord.modifiers.Count + 1)
    for ($i = 0; $i -lt $chord.modifiers.Count; $i++) {
        $keys[$i] = [UInt16]$chord.modifiers[$i]
    }
    $keys[$chord.modifiers.Count] = [UInt16]$chord.main
    [OCUWin32]::SendKeyboardChord($keys)
}

function Test-PasteShortcut($chord) {
    if ($chord.modifiers.Count -ne 1) {
        return $false
    }
    return ([int]$chord.modifiers[0] -eq 0x11 -and [int]$chord.main -eq 0x56)
}

function Send-PasteShortcutFallback($process, [IntPtr]$hwnd) {
    $element = Find-TextEntryElement $process
    $targetHwnd = Find-TextEntryWindowHandle $process $element
    if ($targetHwnd -eq [IntPtr]::Zero) {
        $targetHwnd = $hwnd
    }
    [void][OCUWin32]::PostMessage($targetHwnd, $WM_PASTE, [IntPtr]::Zero, [IntPtr]::Zero)
}

function Send-Key($process, [IntPtr]$hwnd, [string]$key) {
    $chord = ConvertTo-KeyChord $key
    if ($chord.modifiers.Count -eq 0) {
        Send-PostedKey $hwnd $chord
        return
    }
    $wasExplicitlyActivated = $script:ExplicitlyActivatedPids.ContainsKey([string]$process.Id)

    if (-not (Ensure-KeyboardInputTarget $process $hwnd)) {
        if ($wasExplicitlyActivated) {
            Activate-AppWindow $process $hwnd
        }
        if (-not (Test-ProcessForeground $process)) {
            throw "Modifier key combinations require the target app to be foreground; activate the app first or set OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS=1 to allow Computer Use to bring it forward before pressing '$key'."
        }
    }

    try {
        Send-KeyChordWithInput $chord
    } catch {
        if (-not $wasExplicitlyActivated) {
            throw
        }
        if (Test-PasteShortcut $chord) {
            Send-PasteShortcutFallback $process $hwnd
            return
        }
        Send-PostedKey $hwnd $chord
    }
}

function Test-TitleContainsLiteral([string]$title, [string]$query) {
    if ([string]::IsNullOrWhiteSpace($title) -or [string]::IsNullOrWhiteSpace($query)) {
        return $false
    }
    return $title.IndexOf($query, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Resolve-App([string]$query, [bool]$allowLaunch = $true) {
    $normalized = $query.Trim()
    $processQuery = $normalized
    if ($processQuery.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        $processQuery = $processQuery.Substring(0, $processQuery.Length - 4)
    }
    $processes = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
    $pidValue = 0
    if ([int]::TryParse($normalized, [ref]$pidValue)) {
        $match = $processes | Where-Object { $_.Id -eq $pidValue } | Select-Object -First 1
        if ($null -ne $match) {
            return $match
        }
    }

    $match = $processes | Where-Object {
        $_.ProcessName -ieq $processQuery -or
        "$($_.ProcessName).exe" -ieq $normalized -or
        $_.MainWindowTitle -ieq $normalized -or
        (Test-TitleContainsLiteral $_.MainWindowTitle $normalized)
    } | Select-Object -First 1
    if ($null -ne $match) {
        return $match
    }

    if ($allowLaunch -and (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH")) {
        try {
            $started = Start-Process -FilePath $normalized -PassThru
            for ($i = 0; $i -lt 20; $i++) {
                Start-Sleep -Milliseconds 250
                $candidate = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
                if ($null -ne $candidate -and $candidate.MainWindowHandle -ne 0) {
                    return $candidate
                }
            }
        } catch {
        }
    }

    throw "appNotFound(`"$query`")"
}

function Get-MainElement($process) {
    if ($process.MainWindowHandle -ne 0) {
        return [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$process.MainWindowHandle)
    }
    $condition = New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ProcessIdProperty), $process.Id
    $children = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $condition)
    if ($children.Count -gt 0) {
        return $children.Item(0)
    }
    throw "No top-level UI Automation window is available for $($process.ProcessName). Run the Windows runtime in the signed-in desktop session."
}

function Get-WindowBounds($process, $element) {
    $hwnd = [IntPtr]$process.MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
        $fromWin32 = Get-WindowRectFrame $hwnd
        if ($null -ne $fromWin32) {
            return $fromWin32
        }
    }
    try {
        $rect = $element.Current.BoundingRectangle
        if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
        }
    } catch {
    }
    return $null
}

function Get-PatternNames($element) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($pattern in $element.GetSupportedPatterns()) {
        $programmatic = $pattern.ProgrammaticName
        if ($programmatic -like "InvokePatternIdentifiers.Pattern") { $names.Add("Invoke") }
        elseif ($programmatic -like "TogglePatternIdentifiers.Pattern") { $names.Add("Toggle") }
        elseif ($programmatic -like "SelectionItemPatternIdentifiers.Pattern") { $names.Add("Select") }
        elseif ($programmatic -like "ExpandCollapsePatternIdentifiers.Pattern") {
            try {
                $state = $element.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Current.ExpandCollapseState
                if ($state -eq [Windows.Automation.ExpandCollapseState]::Collapsed) { $names.Add("Expand") }
                elseif ($state -eq [Windows.Automation.ExpandCollapseState]::Expanded) { $names.Add("Collapse") }
            } catch {
                $names.Add("Expand")
                $names.Add("Collapse")
            }
        }
        elseif ($programmatic -like "ScrollItemPatternIdentifiers.Pattern") { $names.Add("ScrollIntoView") }
        elseif ($programmatic -like "ScrollPatternIdentifiers.Pattern") { $names.Add("Scroll") }
        elseif ($programmatic -like "ValuePatternIdentifiers.Pattern") { $names.Add("SetValue") }
    }
    if ($names.Count -gt 0) {
        return @($names | Select-Object -Unique)
    }
    return @()
}

function Get-ElementString($element, [string]$propertyName) {
    try {
        $value = $element.Current.$propertyName
        if ($null -eq $value) {
            return ""
        }
        return [string]$value
    } catch {
        return ""
    }
}

function Get-ElementInt64($element, [string]$propertyName) {
    try {
        return [int64]$element.Current.$propertyName
    } catch {
        return 0
    }
}

function Get-ElementControlTypeName($element) {
    try {
        $controlType = $element.Current.ControlType
        if ($null -eq $controlType) {
            return ""
        }
        return [string]$controlType.ProgrammaticName
    } catch {
        return ""
    }
}

$script:SensitiveFieldLabelRegex = '(?i)\b(password|passcode|pin|secret|token|api\s*key|apikey|credential|private\s*key|recovery\s*code|seed\s*phrase|mnemonic|cvv|security\s*code)\b'
$script:SecretValueRegexes = @(
    '(?i)\bsk-[a-z0-9_-]{12,}\b',
    '\bgh[pousr]_[A-Za-z0-9_]{12,}\b',
    '\bglpat-[A-Za-z0-9_-]{12,}\b',
    '\bnpm_[A-Za-z0-9]{20,}\b',
    '\bhf_[A-Za-z0-9]{20,}\b',
    '\bAKIA[0-9A-Z]{12,}\b',
    '\bAIza[0-9A-Za-z_-]{20,}\b',
    '\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b',
    '\bwhsec_[0-9A-Za-z]{16,}\b',
    '\bxox[abprs]-[0-9A-Za-z-]{20,}\b',
    '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b',
    '-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----'
)

function Get-PaymentCardDigits([string]$value) {
    if ([string]::IsNullOrEmpty($value)) {
        return ""
    }
    return ([regex]::Replace($value, '\D', ''))
}

function Test-AllSameDigit([string]$digits) {
    if ([string]::IsNullOrEmpty($digits)) {
        return $false
    }
    $first = $digits[0]
    for ($i = 1; $i -lt $digits.Length; $i++) {
        if ($digits[$i] -ne $first) {
            return $false
        }
    }
    return $true
}

function Test-LuhnDigits([string]$digits) {
    if ($digits.Length -lt 13 -or $digits.Length -gt 19 -or (Test-AllSameDigit $digits)) {
        return $false
    }
    $sum = 0
    $double = $false
    for ($i = $digits.Length - 1; $i -ge 0; $i--) {
        $digit = [int]::Parse([string]$digits[$i])
        if ($double) {
            $digit = $digit * 2
            if ($digit -gt 9) {
                $digit = $digit - 9
            }
        }
        $sum += $digit
        $double = -not $double
    }
    return ($sum % 10) -eq 0
}

function Test-PaymentCardIssuerPrefix([string]$digits) {
    if ([string]::IsNullOrEmpty($digits)) {
        return $false
    }
    if ($digits.StartsWith("4")) {
        return $true
    }
    if ($digits.Length -ge 2) {
        $prefix2 = [int]$digits.Substring(0, 2)
        if (($prefix2 -ge 51 -and $prefix2 -le 55) -or $prefix2 -eq 34 -or $prefix2 -eq 37 -or $prefix2 -eq 65 -or $prefix2 -eq 36 -or $prefix2 -eq 38 -or $prefix2 -eq 39 -or $prefix2 -eq 62) {
            return $true
        }
    }
    if ($digits.Length -ge 3) {
        $prefix3 = [int]$digits.Substring(0, 3)
        if (($prefix3 -ge 300 -and $prefix3 -le 305) -or ($prefix3 -ge 644 -and $prefix3 -le 649)) {
            return $true
        }
    }
    if ($digits.Length -ge 4) {
        $prefix4 = [int]$digits.Substring(0, 4)
        if (($prefix4 -ge 2221 -and $prefix4 -le 2720) -or $prefix4 -eq 6011 -or ($prefix4 -ge 3528 -and $prefix4 -le 3589)) {
            return $true
        }
    }
    return $false
}

function Test-PaymentCardNumberCandidate([string]$value) {
    $digits = Get-PaymentCardDigits $value
    return (Test-PaymentCardIssuerPrefix $digits) -and (Test-LuhnDigits $digits)
}

function Redact-PaymentCardNumbers([string]$text) {
    $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        if (Test-PaymentCardNumberCandidate $match.Value) {
            return "[redacted payment card]"
        }
        return $match.Value
    }
    return [regex]::Replace($text, '(?<!\d)(?:\d[ -]?){13,19}(?!\d)', $evaluator)
}

function Redact-KnownSensitiveText([string]$text) {
    if ([string]::IsNullOrEmpty($text)) {
        return $text
    }
    $redacted = [string]$text
    $redacted = [regex]::Replace($redacted, '(?i)((?:api[-_\s]*key|token|secret|password|passwd|pwd|credential)\s*[:=]\s*)\S{4,}', '$1[redacted]')
    foreach ($pattern in $script:SecretValueRegexes) {
        $redacted = [regex]::Replace($redacted, $pattern, '[redacted secret]')
    }
    $redacted = Redact-PaymentCardNumbers $redacted
    return $redacted
}

function Test-KnownSensitiveText([string]$text) {
    if ([string]::IsNullOrEmpty($text)) {
        return $false
    }
    $redacted = Redact-KnownSensitiveText $text
    return -not [string]::Equals($redacted, $text, [StringComparison]::Ordinal)
}

function Test-SensitiveFieldLabel([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $false
    }
    return [regex]::IsMatch($text, $script:SensitiveFieldLabelRegex)
}

function Test-ElementIsPassword($element) {
    try {
        return [bool]$element.Current.IsPassword
    } catch {
        return $false
    }
}

function Test-ElementLooksSensitive($element, [string]$name, [string]$automationId, [string]$className, [string]$localizedControlType) {
    if (Test-ElementIsPassword $element) {
        return $true
    }
    return Test-SensitiveFieldLabel "$name $automationId $className $localizedControlType"
}

function Get-ElementValueInfo($element, [bool]$isSensitiveField) {
    if ($isSensitiveField) {
        return [pscustomobject]@{
            text = "[redacted sensitive field]"
            containsSensitiveText = $true
        }
    }
    try {
        $valuePattern = $element.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        $value = $valuePattern.Current.Value
        if ($null -eq $value) {
            return [pscustomobject]@{
                text = ""
                containsSensitiveText = $false
            }
        }
        $rawText = [string]$value
        $text = Redact-KnownSensitiveText $rawText
        $containsSensitiveText = -not [string]::Equals($text, $rawText, [StringComparison]::Ordinal)
        if ($text.Length -gt 500) {
            $text = $text.Substring(0, 500)
        }
        return [pscustomobject]@{
            text = $text
            containsSensitiveText = $containsSensitiveText
        }
    } catch {
        return [pscustomobject]@{
            text = ""
            containsSensitiveText = $false
        }
    }
}

function Get-ElementRecord($element, [int]$index, $windowBounds) {
    $frame = Get-ElementFrame $element $windowBounds
    $runtimeId = @()
    try { $runtimeId = @($element.GetRuntimeId()) } catch {}
    $automationId = Get-ElementString $element "AutomationId"
    $name = Get-ElementString $element "Name"
    $className = Get-ElementString $element "ClassName"
    $localizedControlType = Get-ElementString $element "LocalizedControlType"
    $fieldSensitive = Test-ElementLooksSensitive $element $name $automationId $className $localizedControlType
    $metadataSensitive = Test-KnownSensitiveText "$automationId $name $className $localizedControlType"
    $valueInfo = Get-ElementValueInfo $element $fieldSensitive
    $isSensitive = $fieldSensitive -or $metadataSensitive -or $valueInfo.containsSensitiveText
    [pscustomobject]@{
        index = $index
        runtimeId = $runtimeId
        automationId = Redact-KnownSensitiveText $automationId
        name = Redact-KnownSensitiveText $name
        controlType = Get-ElementControlTypeName $element
        localizedControlType = Redact-KnownSensitiveText $localizedControlType
        className = Redact-KnownSensitiveText $className
        value = $valueInfo.text
        nativeWindowHandle = Get-ElementInt64 $element "NativeWindowHandle"
        frame = $frame
        actions = @(Get-PatternNames $element)
        isSensitive = $isSensitive
    }
}

function Get-ElementTitle($record) {
    if (-not [string]::IsNullOrWhiteSpace($record.name)) {
        return $record.name
    }
    if (-not [string]::IsNullOrWhiteSpace($record.automationId)) {
        return "ID: $($record.automationId)"
    }
    return ""
}

function Render-Tree($element, $windowBounds) {
    $records = New-Object System.Collections.Generic.List[object]
    $lines = New-Object System.Collections.Generic.List[string]
    $visited = New-Object System.Collections.Generic.HashSet[string]
    $nextIndex = 0

    function Visit($node, [int]$depth) {
        if ($script:nextIndex -ge 500 -or $depth -gt 16) {
            return
        }
        $runtime = ""
        try { $runtime = (@($node.GetRuntimeId()) -join ".") } catch { $runtime = [guid]::NewGuid().ToString() }
        if (-not $script:visited.Add($runtime)) {
            return
        }

        $index = $script:nextIndex
        $script:nextIndex++
        $record = Get-ElementRecord $node $index $script:windowBounds
        $script:records.Add($record)

        $role = $record.localizedControlType
        if ([string]::IsNullOrWhiteSpace($role)) {
            $role = $record.controlType
        }
        $title = Get-ElementTitle $record
        $actionsSegment = ""
        if ($record.actions.Count -gt 0) {
            $actionsSegment = " Secondary Actions: " + ($record.actions -join ", ")
        }
        $valueSegment = ""
        if (-not [string]::IsNullOrWhiteSpace($record.value) -and $record.value -ne $title) {
            $safeValue = (($record.value -replace "`r", "\\r") -replace "`n", "\\n")
            $valueSegment = " Value: $safeValue"
        }
        if ($record.isSensitive -and [string]::IsNullOrWhiteSpace($valueSegment)) {
            $valueSegment = " Value: [redacted sensitive field]"
        }
        $frameSegment = ""
        if ($null -ne $record.frame) {
            $frameSegment = " Frame: {{x: {0}, y: {1}, width: {2}, height: {3}}}" -f [int][math]::Round($record.frame.x), [int][math]::Round($record.frame.y), [int][math]::Round($record.frame.width), [int][math]::Round($record.frame.height)
        }
        $script:lines.Add(("`t" * ($depth + 1)) + "$index $role $title$valueSegment$actionsSegment$frameSegment")

        try {
            $children = $node.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
            for ($i = 0; $i -lt $children.Count; $i++) {
                Visit $children.Item($i) ($depth + 1)
            }
        } catch {
        }
    }

    $script:records = $records
    $script:lines = $lines
    $script:visited = $visited
    $script:nextIndex = $nextIndex
    $script:windowBounds = $windowBounds
    Visit $element 0

    [pscustomobject]@{
        records = $records.ToArray()
        lines = $lines.ToArray()
    }
}

function Test-ContainsSensitiveRecord($records) {
    foreach ($record in @($records)) {
        if ($record.isSensitive) {
            return $true
        }
    }
    return $false
}

function Capture-WindowPngBase64($bounds) {
    if ($null -eq $bounds -or $bounds.width -le 0 -or $bounds.height -le 0) {
        return $null
    }
    try {
        $bitmap = New-Object System.Drawing.Bitmap ([int][math]::Round($bounds.width)), ([int][math]::Round($bounds.height))
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen([int][math]::Round($bounds.x), [int][math]::Round($bounds.y), 0, 0, $bitmap.Size)
        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()
        $bytes = $stream.ToArray()
        $stream.Dispose()
        return [Convert]::ToBase64String($bytes)
    } catch {
        return $null
    }
}

function Get-FocusedSummary($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $processId) {
            $role = $focused.Current.LocalizedControlType
            $name = $focused.Current.Name
            if (Test-ElementLooksSensitive $focused $name (Get-ElementString $focused "AutomationId") (Get-ElementString $focused "ClassName") $role) {
                return "$role [sensitive field]"
            }
            $name = Redact-KnownSensitiveText $name
            if ([string]::IsNullOrWhiteSpace($name)) {
                return $role
            }
            return "$role $name"
        }
    } catch {
    }
    return $null
}

function Get-SelectedTextInfo($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -eq $focused -or $focused.Current.ProcessId -ne $processId) {
            return [pscustomobject]@{
                text = $null
                containsSensitiveText = $false
            }
        }
        if (Test-ElementLooksSensitive $focused (Get-ElementString $focused "Name") (Get-ElementString $focused "AutomationId") (Get-ElementString $focused "ClassName") (Get-ElementString $focused "LocalizedControlType")) {
            return [pscustomobject]@{
                text = "[redacted sensitive field]"
                containsSensitiveText = $true
            }
        }
        $textPattern = $focused.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
        $selection = $textPattern.GetSelection()
        if ($selection.Count -gt 0) {
            $rawSelectedText = $selection.Item(0).GetText(2048)
            $selectedText = Redact-KnownSensitiveText $rawSelectedText
            return [pscustomobject]@{
                text = $selectedText
                containsSensitiveText = -not [string]::Equals($selectedText, $rawSelectedText, [StringComparison]::Ordinal)
            }
        }
    } catch {
    }
    return [pscustomobject]@{
        text = $null
        containsSensitiveText = $false
    }
}

function Get-AppDescriptor($process) {
    [pscustomobject]@{
        name = $process.ProcessName
        bundleIdentifier = $process.ProcessName
        pid = [int]$process.Id
    }
}

function Get-WindowTitleInfo($process) {
    $rawTitle = ""
    try {
        $rawTitle = [string]$process.MainWindowTitle
    } catch {
    }
    $redactedTitle = Redact-KnownSensitiveText $rawTitle
    [pscustomobject]@{
        text = $redactedTitle
        containsSensitiveText = -not [string]::Equals($redactedTitle, $rawTitle, [StringComparison]::Ordinal)
    }
}

function Build-Snapshot([string]$query) {
    $process = Resolve-App $query
    $element = Get-MainElement $process
    $bounds = Get-WindowBounds $process $element
    $rendered = Render-Tree $element $bounds
    $titleInfo = Get-WindowTitleInfo $process
    $selectedTextInfo = Get-SelectedTextInfo $process.Id
    $containsSensitive = (Test-ContainsSensitiveRecord $rendered.records) -or $titleInfo.containsSensitiveText -or $selectedTextInfo.containsSensitiveText
    $screenshot = $null
    if (-not $containsSensitive) {
        $screenshot = Capture-WindowPngBase64 $bounds
    }
    [pscustomobject]@{
        app = Get-AppDescriptor $process
        windowTitle = $titleInfo.text
        windowBounds = $bounds
        screenshotPngBase64 = $screenshot
        sensitiveContentRedacted = $containsSensitive
        treeLines = @($rendered.lines)
        focusedSummary = Get-FocusedSummary $process.Id
        selectedText = $selectedTextInfo.text
        elements = @($rendered.records)
    }
}

function Get-AppListEntries {
    $entries = New-Object System.Collections.Generic.List[object]
    foreach ($process in (Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object ProcessName, Id)) {
        $title = (Get-WindowTitleInfo $process).text
        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = "untitled"
        }
        $entries.Add([pscustomobject]@{
            app = Get-AppDescriptor $process
            windowTitle = $title
        })
    }
    return $entries.ToArray()
}

function Format-AppList($entries) {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $entries) {
        $lines.Add(("{0} -- {1} [running, pid={2}, window={3}]" -f $entry.app.name, $entry.app.name, $entry.app.pid, $entry.windowTitle))
    }
    return ($lines -join "`n")
}

function Same-RuntimeId($left, $right) {
    if ($null -eq $left -or $null -eq $right -or $left.Count -ne $right.Count) {
        return $false
    }
    for ($i = 0; $i -lt $left.Count; $i++) {
        if ([int]$left[$i] -ne [int]$right[$i]) {
            return $false
        }
    }
    return $true
}

function Get-AllElements($root) {
    $items = New-Object System.Collections.Generic.List[object]
    $items.Add($root)
    try {
        $descendants = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        for ($i = 0; $i -lt $descendants.Count; $i++) {
            $items.Add($descendants.Item($i))
        }
    } catch {
    }
    return $items.ToArray()
}

function Find-Element($process, $record) {
    if ($null -eq $record) {
        return $null
    }
    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        try {
            if (Same-RuntimeId @($element.GetRuntimeId()) @($record.runtimeId)) {
                return $element
            }
        } catch {
        }
    }
    foreach ($element in (Get-AllElements $root)) {
        try {
            $sameAutomationId = -not [string]::IsNullOrWhiteSpace($record.automationId) -and $element.Current.AutomationId -eq $record.automationId
            $sameName = -not [string]::IsNullOrWhiteSpace($record.name) -and $element.Current.Name -eq $record.name
            $sameType = $element.Current.ControlType.ProgrammaticName -eq $record.controlType
            if (($sameAutomationId -or $sameName) -and $sameType) {
                return $element
            }
        } catch {
        }
    }
    return $null
}

function Get-CurrentPatternOrNull($element, $pattern) {
    try {
        return $element.GetCurrentPattern($pattern)
    } catch {
        return $null
    }
}

function Invoke-PreferredClick($element) {
    $invoke = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
    if ($null -ne $invoke) {
        $invoke.Invoke()
        return $true
    }
    $selection = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $selection) {
        $selection.Select()
        return $true
    }
    $toggle = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
    if ($null -ne $toggle) {
        $toggle.Toggle()
        return $true
    }
    return $false
}

function Invoke-SecondaryAction($element, [string]$action) {
    switch ($action.ToLowerInvariant()) {
        "invoke" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Invoke(); return }
        }
        "toggle" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Toggle(); return }
        }
        "select" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Select(); return }
        }
        "expand" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Expand(); return }
        }
        "collapse" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Collapse(); return }
        }
        "scrollintoview" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.ScrollIntoView(); return }
        }
        "setfocus" {
            if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS")) {
                throw "SetFocus is disabled by default to avoid stealing user focus; set OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS=1 to enable it."
            }
            $element.SetFocus()
            return
        }
    }
    throw "$action is not a valid secondary action for $($operation.element.index)"
}

function Invoke-Scroll($element, [string]$direction, [double]$pages) {
    $scroll = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollPattern]::Pattern)
    if ($null -eq $scroll) {
        return $false
    }
    $horizontal = [Windows.Automation.ScrollAmount]::NoAmount
    $vertical = [Windows.Automation.ScrollAmount]::NoAmount
    if ($direction -eq "up") { $vertical = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "down") { $vertical = [Windows.Automation.ScrollAmount]::LargeIncrement }
    elseif ($direction -eq "left") { $horizontal = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "right") { $horizontal = [Windows.Automation.ScrollAmount]::LargeIncrement }
    $repeat = [math]::Max(1, [int][math]::Ceiling($pages))
    for ($i = 0; $i -lt $repeat; $i++) {
        $scroll.Scroll($horizontal, $vertical)
        Start-Sleep -Milliseconds 40
    }
    return $true
}

function Find-TextEntryElement($process) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $process.Id) {
            $focusedValue = Get-CurrentPatternOrNull $focused ([Windows.Automation.ValuePattern]::Pattern)
            if ($null -ne $focusedValue -and -not $focusedValue.Current.IsReadOnly) {
                return $focused
            }
        }
    } catch {
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -eq $valuePattern -or $valuePattern.Current.IsReadOnly) {
            continue
        }
        $controlType = Get-ElementControlTypeName $element
        if ($controlType -like "*Edit*" -or $controlType -like "*Document*") {
            return $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return $element
        }
    }

    return $null
}

function Get-NativeWindowHandle($element) {
    $handle = Get-ElementInt64 $element "NativeWindowHandle"
    if ($handle -le 0) {
        return [IntPtr]::Zero
    }
    return [IntPtr]$handle
}

function Test-TextWindowHandleCandidate($process, $element) {
    if ($null -eq $element) {
        return $false
    }
    $handle = Get-NativeWindowHandle $element
    if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr]$process.MainWindowHandle) {
        return $false
    }
    $controlType = Get-ElementControlTypeName $element
    $className = Get-ElementString $element "ClassName"
    return (
        $controlType -like "*Edit*" -or
        $controlType -like "*Document*" -or
        $className -like "*Edit*" -or
        $className -like "*Rich*" -or
        $className -like "*Text*"
    )
}

function Find-TextEntryWindowHandle($process, $preferredElement) {
    if (Test-TextWindowHandleCandidate $process $preferredElement) {
        return Get-NativeWindowHandle $preferredElement
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        if (-not (Test-TextWindowHandleCandidate $process $element)) {
            continue
        }
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return Get-NativeWindowHandle $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        if (Test-TextWindowHandleCandidate $process $element) {
            return Get-NativeWindowHandle $element
        }
    }

    return [IntPtr]::Zero
}

function Invoke-TypeText($process, [string]$text, $preferredElement) {
    $explicitElement = $null -ne $preferredElement
    $element = $null
    $targetHwnd = [IntPtr]::Zero
    if ($null -ne $preferredElement) {
        $element = $preferredElement
        if (Test-TextWindowHandleCandidate $process $element) {
            $targetHwnd = Get-NativeWindowHandle $element
        }
    } else {
        $element = Find-TextEntryElement $process
        $targetHwnd = Find-TextEntryWindowHandle $process $element
    }
    if ($targetHwnd -ne [IntPtr]::Zero -and (Send-TextToEditHandle $targetHwnd $text $element)) {
        return $true
    }

    if ($null -ne $element) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK")) {
                throw "UIA ValuePattern text fallback is disabled by default because it may bring the target app to the foreground; set OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK=1 to enable it."
            }
            $current = ""
            try { $current = [string]$valuePattern.Current.Value } catch {}
            $valuePattern.SetValue($current + $text)
            return $true
        }
    }
    if ($explicitElement) {
        throw "Target element is not a writable text entry"
    }
    return $false
}

function Invoke-ComputerUseOperation($operation) {
try {
    Assert-InteractiveDesktop
    if ($operation.tool -eq "list_apps") {
        $entries = @(Get-AppListEntries)
        $response = [pscustomobject]@{ ok = $true; text = (Format-AppList $entries); apps = $entries }
    } elseif ($operation.tool -eq "resolve_app") {
        $process = Resolve-App $operation.app $false
        $titleInfo = Get-WindowTitleInfo $process
        $response = [pscustomobject]@{
            ok = $true
            app = Get-AppDescriptor $process
            windowTitle = $titleInfo.text
        }
    } elseif ($operation.tool -eq "get_app_state") {
        $response = [pscustomobject]@{ ok = $true; snapshot = (Build-Snapshot $operation.app) }
    } else {
        $process = Resolve-App $operation.app
        $hwnd = [IntPtr]$process.MainWindowHandle
        $windowBounds = $operation.windowBounds
        $element = Find-Element $process $operation.element

        switch ($operation.tool) {
            "activate_app" {
                Activate-AppWindow $process $hwnd
                $script:ExplicitlyActivatedPids[[string]$process.Id] = $true
            }
            "click" {
                $handled = $false
                if ($null -ne $element -and $operation.mouse_button -ne "right" -and $operation.mouse_button -ne "middle") {
                    $handled = Invoke-PreferredClick $element
                }
                if (-not $handled) {
                    if ($null -ne $operation.element -and $null -ne $operation.element.frame) {
                        $point = Get-ScreenPoint $operation.element.frame $windowBounds
                    } elseif ($null -ne $operation.element) {
                        throw "Target element has no semantic click action or frame"
                    } else {
                        $point = [pscustomobject]@{
                            x = [int][math]::Round($windowBounds.x + [double]$operation.x)
                            y = [int][math]::Round($windowBounds.y + [double]$operation.y)
                        }
                    }
                    Send-MouseClick $hwnd $point.x $point.y $operation.mouse_button ([int]$operation.click_count)
                }
            }
            "perform_secondary_action" {
                if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                Invoke-SecondaryAction $element $operation.action
            }
            "scroll" {
                $handled = $false
                if ($null -ne $element) {
                    $handled = Invoke-Scroll $element $operation.direction ([double]$operation.pages)
                }
                if (-not $handled) {
                    if ($null -eq $operation.element.frame) {
                        throw "Target element has no Scroll support or frame"
                    }
                    $point = Get-ScreenPoint $operation.element.frame $windowBounds
                    Send-Scroll $hwnd $point.x $point.y $operation.direction ([double]$operation.pages)
                }
            }
            "drag" {
                Send-Drag $hwnd ([int][math]::Round($windowBounds.x + [double]$operation.from_x)) ([int][math]::Round($windowBounds.y + [double]$operation.from_y)) ([int][math]::Round($windowBounds.x + [double]$operation.to_x)) ([int][math]::Round($windowBounds.y + [double]$operation.to_y))
            }
            "type_text" {
                if (-not (Invoke-TypeText $process $operation.text $element)) {
                    if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_RAW_TEXT_FALLBACK")) {
                        throw "Raw text fallback is disabled because no writable text entry was found; target an element_index or set OPEN_COMPUTER_USE_WINDOWS_ALLOW_RAW_TEXT_FALLBACK=1 only for trusted local debugging."
                    }
                    Send-Text $hwnd $operation.text
                }
            }
            "press_key" {
                Send-Key $process $hwnd $operation.key
            }
            "set_value" {
                if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
                if ($null -eq $valuePattern) {
                    throw "Cannot set a value for an element that is not settable"
                }
                $valuePattern.SetValue($operation.value)
            }
            default {
                throw "unsupportedTool(`"$($operation.tool)`")"
            }
        }

        Start-Sleep -Milliseconds 120
        $response = [pscustomobject]@{ ok = $true; snapshot = (Build-Snapshot $operation.app) }
    }
} catch {
    $message = $_.Exception.Message
    if (-not [string]::IsNullOrWhiteSpace($_.ScriptStackTrace)) {
        $message = "$message at $($_.ScriptStackTrace)"
    }
    $response = [pscustomobject]@{ ok = $false; error = $message }
}
    return $response
}

if ($Worker) {
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) {
            break
        }
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        try {
            $operation = $line | ConvertFrom-Json
            $response = Invoke-ComputerUseOperation $operation
        } catch {
            $message = $_.Exception.Message
            if (-not [string]::IsNullOrWhiteSpace($_.ScriptStackTrace)) {
                $message = "$message at $($_.ScriptStackTrace)"
            }
            $response = [pscustomobject]@{ ok = $false; error = $message }
        }
        [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 50 -Compress))
        [Console]::Out.Flush()
    }
    exit 0
}

if ([string]::IsNullOrWhiteSpace($OperationPath)) {
    throw "OperationPath is required unless -Worker is set."
}

$operation = Get-Content -Raw -Path $OperationPath | ConvertFrom-Json
$response = Invoke-ComputerUseOperation $operation
$response | ConvertTo-Json -Depth 50 -Compress
