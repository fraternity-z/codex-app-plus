import { useMemo } from "react";
import rawLicenses from "../../assets/third-party-licenses.json";

type LicensesPayload = Record<string, unknown>;

const licenses = rawLicenses as unknown as LicensesPayload;

interface OpenSourceLicensesDialogProps {
  readonly open: boolean;
  onClose: () => void;
}

export function OpenSourceLicensesDialog(props: OpenSourceLicensesDialogProps): JSX.Element | null {
  const { open, onClose } = props;
  const text = useMemo(() => JSON.stringify(licenses, null, 2), []);

  if (!open) {
    return null;
  }

  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="开源许可证"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <strong>开源许可证</strong>
          <button type="button" className="settings-dialog-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="settings-dialog-body">
          <textarea className="settings-dialog-textarea" readOnly value={text} />
        </div>
      </section>
    </div>
  );
}

