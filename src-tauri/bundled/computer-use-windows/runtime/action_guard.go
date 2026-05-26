package main

import (
	"fmt"
	"regexp"
	"strings"
)

const actionGuardEnvAllowRisky = "OPEN_COMPUTER_USE_WINDOWS_ALLOW_RISKY_ACTIONS"

var secretInputPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bsk-[a-z0-9_-]{12,}\b`),
	regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9_]{12,}\b`),
	regexp.MustCompile(`\bglpat-[A-Za-z0-9_-]{12,}\b`),
	regexp.MustCompile(`\bnpm_[A-Za-z0-9]{20,}\b`),
	regexp.MustCompile(`\bhf_[A-Za-z0-9]{20,}\b`),
	regexp.MustCompile(`\bAKIA[0-9A-Z]{12,}\b`),
	regexp.MustCompile(`\bAIza[0-9A-Za-z_-]{20,}\b`),
	regexp.MustCompile(`\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b`),
	regexp.MustCompile(`\bwhsec_[0-9A-Za-z]{16,}\b`),
	regexp.MustCompile(`\bxox[abprs]-[0-9A-Za-z-]{20,}\b`),
	regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`),
	regexp.MustCompile(`(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----`),
}

var paymentCardCandidatePattern = regexp.MustCompile(`(?:\d[ -]?){13,19}`)

type actionRiskTerm struct {
	term   string
	reason string
}

type coordinatePoint struct {
	x float64
	y float64
}

var actionRiskTerms = []actionRiskTerm{
	{term: "format disk", reason: "it may format storage or erase data"},
	{term: "delete", reason: "it may delete local or cloud data"},
	{term: "permanently delete", reason: "it may permanently delete data"},
	{term: "empty recycle bin", reason: "it may permanently delete data"},
	{term: "erase", reason: "it may erase data"},
	{term: "wipe", reason: "it may wipe data"},
	{term: "factory reset", reason: "it may reset the device or app state"},
	{term: "reset this pc", reason: "it may reset the device"},
	{term: "partition", reason: "it may repartition storage"},
	{term: "initialize disk", reason: "it may initialize or repartition storage"},
	{term: "remove account", reason: "it may remove account data or access"},
	{term: "revoke", reason: "it may revoke access or credentials"},
	{term: "disable account", reason: "it may disable an account"},
	{term: "password", reason: "it may expose or submit a password"},
	{term: "passcode", reason: "it may expose or submit a passcode"},
	{term: "secret", reason: "it may expose or submit a secret"},
	{term: "token", reason: "it may expose or submit a token"},
	{term: "api key", reason: "it may expose or submit an API key"},
	{term: "apikey", reason: "it may expose or submit an API key"},
	{term: "credential", reason: "it may expose or submit credentials"},
	{term: "private key", reason: "it may expose or submit a private key"},
	{term: "recovery code", reason: "it may expose recovery credentials"},
	{term: "seed phrase", reason: "it may expose wallet recovery credentials"},
	{term: "mnemonic", reason: "it may expose wallet recovery credentials"},
	{term: "show password", reason: "it may reveal a password on screen"},
	{term: "copy password", reason: "it may copy a password or secret"},
	{term: "pay", reason: "it may create a financial side effect"},
	{term: "purchase", reason: "it may create a financial side effect"},
	{term: "transfer", reason: "it may create a financial side effect"},
	{term: "subscribe", reason: "it may create a subscription"},
	{term: "checkout", reason: "it may create a financial side effect"},
	{term: "confirm order", reason: "it may place or confirm an order"},
	{term: "send", reason: "it may send data as the user"},
	{term: "post", reason: "it may publish data as the user"},
	{term: "publish", reason: "it may publish data as the user"},
	{term: "submit", reason: "it may submit data as the user"},
	{term: "删除", reason: "it may delete local or cloud data"},
	{term: "永久删除", reason: "it may permanently delete data"},
	{term: "移除账户", reason: "it may remove account data or access"},
	{term: "清空回收站", reason: "it may permanently delete data"},
	{term: "清除磁盘", reason: "it may erase storage"},
	{term: "抹掉", reason: "it may erase data"},
	{term: "格式化", reason: "it may format storage or erase data"},
	{term: "分区", reason: "it may repartition storage"},
	{term: "初始化磁盘", reason: "it may initialize or repartition storage"},
	{term: "恢复出厂", reason: "it may reset the device or app state"},
	{term: "重置此电脑", reason: "it may reset the device"},
	{term: "撤销访问", reason: "it may revoke access or credentials"},
	{term: "禁用账户", reason: "it may disable an account"},
	{term: "密码", reason: "it may expose or submit a password"},
	{term: "密钥", reason: "it may expose or submit a key"},
	{term: "令牌", reason: "it may expose or submit a token"},
	{term: "凭据", reason: "it may expose or submit credentials"},
	{term: "私钥", reason: "it may expose or submit a private key"},
	{term: "恢复码", reason: "it may expose recovery credentials"},
	{term: "助记词", reason: "it may expose wallet recovery credentials"},
	{term: "显示密码", reason: "it may reveal a password on screen"},
	{term: "复制密码", reason: "it may copy a password or secret"},
	{term: "支付", reason: "it may create a financial side effect"},
	{term: "付款", reason: "it may create a financial side effect"},
	{term: "转账", reason: "it may create a financial side effect"},
	{term: "购买", reason: "it may create a financial side effect"},
	{term: "订阅", reason: "it may create a subscription"},
	{term: "下单", reason: "it may place or confirm an order"},
	{term: "发送", reason: "it may send data as the user"},
	{term: "发布", reason: "it may publish data as the user"},
	{term: "提交", reason: "it may submit data as the user"},
}

func guardElementAction(tool string, app appDescriptor, element *elementRecord) error {
	if actionGuardDisabled() || element == nil {
		return nil
	}
	if element.IsSensitive {
		return blockedActionError(tool, app, "target UI is marked as sensitive")
	}
	if reason := riskyTextReason(elementRiskText(element)); reason != "" {
		return blockedActionError(tool, app, reason)
	}
	return nil
}

func guardElementActionInSnapshot(tool string, app appDescriptor, snapshot *appSnapshot, element *elementRecord) error {
	if err := guardElementAction(tool, app, element); err != nil {
		return err
	}
	if actionGuardDisabled() || snapshot == nil || element == nil {
		return nil
	}
	if isConfirmationElement(element) {
		if reason := riskyTextReason(snapshotRiskText(snapshot)); reason != "" {
			return blockedActionError(tool, app, "confirmation control is blocked because the current UI contains a risky control: "+reason)
		}
	}
	return nil
}

func guardCoordinateAction(tool string, app appDescriptor, snapshot *appSnapshot, points ...coordinatePoint) error {
	if actionGuardDisabled() || snapshot == nil {
		return nil
	}
	if snapshot.SensitiveRedacted {
		return blockedActionError(tool, app, "coordinate actions are blocked while sensitive UI content is present")
	}
	contextRisk := riskyTextReason(snapshotRiskText(snapshot))
	if len(points) == 0 && contextRisk != "" {
		return blockedActionError(tool, app, "coordinate actions are blocked because the current UI contains a risky control: "+contextRisk)
	}
	for _, point := range points {
		element := elementAtPoint(snapshot.Elements, point)
		if element == nil {
			if contextRisk != "" {
				return blockedActionError(tool, app, "coordinate actions are blocked because the target is unknown and the current UI contains a risky control: "+contextRisk)
			}
			continue
		}
		if err := guardElementActionInSnapshot(tool, app, snapshot, element); err != nil {
			return err
		}
	}
	return nil
}

func guardScrollAction(app appDescriptor, snapshot *appSnapshot, element *elementRecord) error {
	if actionGuardDisabled() {
		return nil
	}
	if snapshot != nil && snapshot.SensitiveRedacted {
		return blockedActionError("scroll", app, "scrolling is blocked while sensitive UI content is present")
	}
	return guardElementAction("scroll", app, element)
}

func guardTextAction(tool string, app appDescriptor, snapshot *appSnapshot, element *elementRecord, text string) error {
	if actionGuardDisabled() {
		return nil
	}
	if err := guardElementAction(tool, app, element); err != nil {
		return err
	}
	if snapshot != nil && snapshot.SensitiveRedacted {
		return blockedActionError(tool, app, "text entry is blocked while sensitive UI content is present")
	}
	if looksLikeSecretInput(text) {
		return blockedActionError(tool, app, "input text looks like a secret or credential")
	}
	return nil
}

func guardKeyAction(app appDescriptor, snapshot *appSnapshot, key string) error {
	if actionGuardDisabled() {
		return nil
	}
	normalized := normalizeKeyForGuard(key)
	if normalized == "" {
		return nil
	}
	if normalized == "delete" || normalized == "del" || strings.Contains(normalized, "+delete") || strings.Contains(normalized, "+del") {
		return blockedActionError("press_key", app, "the Delete key can remove selected content or files")
	}
	if isSystemShortcut(normalized) {
		return blockedActionError("press_key", app, "system/global shortcuts can escape the target app or open privileged Windows surfaces")
	}
	if normalized == "alt+f4" || normalized == "ctrl+w" || normalized == "control+w" || normalized == "ctrl+q" || normalized == "control+q" {
		return blockedActionError("press_key", app, "the shortcut can close apps, tabs, or unsaved work")
	}
	if isDataShortcut(normalized) && snapshot != nil {
		if snapshot.SensitiveRedacted {
			return blockedActionError("press_key", app, "clipboard and selection shortcuts are blocked while sensitive UI content is present")
		}
		if reason := riskyTextReason(snapshotRiskText(snapshot)); reason != "" {
			return blockedActionError("press_key", app, "clipboard and selection shortcut is blocked because the current UI contains a risky control: "+reason)
		}
	}
	if isConfirmationKey(normalized) && snapshot != nil {
		if snapshot.SensitiveRedacted {
			return blockedActionError("press_key", app, "confirmation keys are blocked while sensitive UI content is present")
		}
		if reason := riskyTextReason(snapshotRiskText(snapshot)); reason != "" {
			return blockedActionError("press_key", app, "confirmation key is blocked because the current UI contains a risky control: "+reason)
		}
	}
	return nil
}

func actionGuardDisabled() bool {
	return envFlagEnabled(actionGuardEnvAllowRisky)
}

func elementRiskText(element *elementRecord) string {
	return strings.Join([]string{
		element.Name,
		element.AutomationID,
		element.LocalizedControlType,
		element.ControlType,
		element.ClassName,
		element.Value,
		strings.Join(element.Actions, " "),
	}, " ")
}

func elementAtPoint(elements []elementRecord, point coordinatePoint) *elementRecord {
	var best *elementRecord
	bestArea := 0.0
	for index := range elements {
		element := &elements[index]
		if element.Frame == nil || !frameContainsPoint(element.Frame, point) {
			continue
		}
		area := element.Frame.Width * element.Frame.Height
		if area <= 0 {
			continue
		}
		if best == nil || area < bestArea {
			best = element
			bestArea = area
		}
	}
	return best
}

func frameContainsPoint(frame *frame, point coordinatePoint) bool {
	if frame == nil || frame.Width <= 0 || frame.Height <= 0 {
		return false
	}
	return point.x >= frame.X &&
		point.y >= frame.Y &&
		point.x < frame.X+frame.Width &&
		point.y < frame.Y+frame.Height
}

func snapshotRiskText(snapshot *appSnapshot) string {
	if snapshot == nil {
		return ""
	}
	parts := []string{snapshot.WindowTitle, snapshot.FocusedSummary, snapshot.SelectedText}
	parts = append(parts, snapshot.TreeLines...)
	return strings.Join(parts, " ")
}

func isConfirmationElement(element *elementRecord) bool {
	if element == nil {
		return false
	}
	normalized := normalizeRiskText(strings.Join([]string{
		element.Name,
		element.Value,
		element.LocalizedControlType,
		element.ControlType,
	}, " "))
	if normalized == "" {
		return false
	}
	for _, phrase := range []string{
		"ok",
		"yes",
		"confirm",
		"continue",
		"apply",
		"submit",
		"send",
		"确定",
		"是",
		"确认",
		"继续",
		"应用",
		"提交",
		"发送",
	} {
		if containsRiskTerm(normalized, normalizeRiskText(phrase)) {
			return true
		}
	}
	return false
}

func riskyTextReason(text string) string {
	normalized := normalizeRiskText(text)
	if normalized == "" {
		return ""
	}
	for _, item := range actionRiskTerms {
		if containsRiskTerm(normalized, normalizeRiskText(item.term)) {
			return item.reason
		}
	}
	return ""
}

func containsRiskTerm(normalizedText, normalizedTerm string) bool {
	if normalizedTerm == "" {
		return false
	}
	if isASCIIWordPhrase(normalizedTerm) {
		return strings.Contains(" "+normalizedText+" ", " "+normalizedTerm+" ")
	}
	return strings.Contains(normalizedText, normalizedTerm)
}

func isASCIIWordPhrase(value string) bool {
	for _, char := range value {
		if char == ' ' || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			continue
		}
		return false
	}
	return true
}

func looksLikeSecretInput(text string) bool {
	for _, pattern := range secretInputPatterns {
		if pattern.MatchString(text) {
			return true
		}
	}
	return containsPaymentCardNumber(text)
}

func containsPaymentCardNumber(text string) bool {
	for _, match := range paymentCardCandidatePattern.FindAllString(text, -1) {
		digits := paymentCardDigits(match)
		if len(digits) >= 13 && len(digits) <= 19 && !allSameDigit(digits) && hasPaymentCardIssuerPrefix(digits) && passesLuhn(digits) {
			return true
		}
	}
	return false
}

func paymentCardDigits(value string) string {
	var builder strings.Builder
	for _, char := range value {
		if char >= '0' && char <= '9' {
			builder.WriteRune(char)
		}
	}
	return builder.String()
}

func allSameDigit(value string) bool {
	if value == "" {
		return false
	}
	first := value[0]
	for index := 1; index < len(value); index++ {
		if value[index] != first {
			return false
		}
	}
	return true
}

func hasPaymentCardIssuerPrefix(digits string) bool {
	if digits == "" {
		return false
	}
	if strings.HasPrefix(digits, "4") {
		return true
	}
	if len(digits) >= 2 {
		prefix2 := parseDigitsPrefix(digits, 2)
		if (prefix2 >= 51 && prefix2 <= 55) || prefix2 == 34 || prefix2 == 37 || prefix2 == 65 || prefix2 == 36 || prefix2 == 38 || prefix2 == 39 || prefix2 == 62 {
			return true
		}
	}
	if len(digits) >= 3 {
		prefix3 := parseDigitsPrefix(digits, 3)
		if (prefix3 >= 300 && prefix3 <= 305) || (prefix3 >= 644 && prefix3 <= 649) {
			return true
		}
	}
	if len(digits) >= 4 {
		prefix4 := parseDigitsPrefix(digits, 4)
		if (prefix4 >= 2221 && prefix4 <= 2720) || prefix4 == 6011 || (prefix4 >= 3528 && prefix4 <= 3589) {
			return true
		}
	}
	return false
}

func parseDigitsPrefix(digits string, length int) int {
	value := 0
	for index := 0; index < length && index < len(digits); index++ {
		value = value*10 + int(digits[index]-'0')
	}
	return value
}

func passesLuhn(digits string) bool {
	sum := 0
	double := false
	for index := len(digits) - 1; index >= 0; index-- {
		digit := int(digits[index] - '0')
		if double {
			digit *= 2
			if digit > 9 {
				digit -= 9
			}
		}
		sum += digit
		double = !double
	}
	return sum%10 == 0
}

func normalizeRiskText(text string) string {
	text = strings.ToLower(text)
	replacer := strings.NewReplacer(
		"\r", " ",
		"\n", " ",
		"\t", " ",
		"_", " ",
		"-", " ",
		":", " ",
		"=", " ",
		"\"", " ",
		"'", " ",
	)
	text = replacer.Replace(text)
	return strings.Join(strings.Fields(text), " ")
}

func normalizeKeyForGuard(key string) string {
	key = strings.TrimSpace(strings.ToLower(key))
	if key == "" {
		return ""
	}
	parts := strings.Split(key, "+")
	for index, part := range parts {
		part = strings.TrimSpace(part)
		part = strings.TrimSuffix(strings.TrimSuffix(part, "_l"), "_r")
		switch part {
		case "control":
			part = "ctrl"
		case "return":
			part = "enter"
		case "delete":
			part = "delete"
		}
		parts[index] = part
	}
	return strings.Join(parts, "+")
}

func isConfirmationKey(normalized string) bool {
	switch normalized {
	case "enter", "return", "space":
		return true
	default:
		return false
	}
}

func isDataShortcut(normalized string) bool {
	switch normalized {
	case "ctrl+a", "control+a", "ctrl+c", "control+c", "ctrl+x", "control+x", "ctrl+v", "control+v":
		return true
	default:
		return false
	}
}

func isSystemShortcut(normalized string) bool {
	parts := keyPartSet(normalized)
	if parts["super"] || parts["win"] || parts["cmd"] || parts["meta"] {
		return true
	}
	if parts["alt"] && (parts["tab"] || parts["escape"] || parts["esc"]) {
		return true
	}
	if parts["ctrl"] && (parts["escape"] || parts["esc"]) {
		return true
	}
	if parts["ctrl"] && parts["shift"] && (parts["escape"] || parts["esc"]) {
		return true
	}
	if parts["ctrl"] && parts["alt"] && (parts["delete"] || parts["del"]) {
		return true
	}
	return false
}

func keyPartSet(normalized string) map[string]bool {
	parts := map[string]bool{}
	for _, part := range strings.Split(normalized, "+") {
		part = strings.TrimSpace(part)
		switch part {
		case "control":
			part = "ctrl"
		case "return":
			part = "enter"
		case "delete":
			part = "delete"
		case "win", "cmd", "meta":
			// Keep these distinct from "super" for clearer tests while treating all as system keys.
		}
		if part != "" {
			parts[part] = true
		}
	}
	return parts
}

func blockedActionError(tool string, app appDescriptor, reason string) error {
	return fmt.Errorf("Computer Use blocked %s for %s because %s. Ask the user to perform this step manually or set %s=1 only for trusted local debugging.", tool, appLabel(app), reason, actionGuardEnvAllowRisky)
}
