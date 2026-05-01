import { useMemo, useState } from "react";
import rawLicenses from "../../../assets/third-party-licenses.json";
import "../../../styles/replica/replica-settings-extra.css";

type LicensePackage = {
  name: string;
  versions: ReadonlyArray<string>;
  license: string;
  author: string | null;
  homepage: string | null;
  description: string | null;
};

type LicensesPayload = Record<string, ReadonlyArray<LicensePackage>>;

type LicensePackageItem = LicensePackage & {
  readonly versionText: string;
  readonly searchText: string;
};

type LicenseSection = {
  readonly license: string;
  readonly packages: ReadonlyArray<LicensePackageItem>;
};

const licenses = rawLicenses as unknown as LicensesPayload;

function buildVersionText(versions: ReadonlyArray<string>): string {
  if (versions.length === 0) {
    return "";
  }
  return versions.join(", ");
}

function buildSearchText(license: string, pkg: LicensePackage, versionText: string): string {
  return [license, pkg.name, pkg.license, pkg.author, pkg.homepage, pkg.description, versionText]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

interface OpenSourceLicensesDialogProps {
  readonly open: boolean;
  onClose: () => void;
}

export function OpenSourceLicensesDialog(props: OpenSourceLicensesDialogProps): JSX.Element | null {
  const { open, onClose } = props;
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const sections = useMemo<ReadonlyArray<LicenseSection>>(() => {
    return Object.entries(licenses)
      .map(([license, packages]) => {
        const mappedPackages = packages.map((pkg) => {
          const versionText = buildVersionText(pkg.versions);
          const searchText = buildSearchText(license, pkg, versionText);
          return {
            ...pkg,
            versionText,
            searchText,
          };
        });
        return {
          license,
          packages: mappedPackages,
        };
      })
      .sort((a, b) => a.license.localeCompare(b.license));
  }, []);
  const filteredSections = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return sections;
    }
    return sections
      .map((section) => {
        const licenseMatches = section.license.toLowerCase().includes(normalizedQuery);
        const packages = licenseMatches
          ? section.packages
          : section.packages.filter((pkg) => pkg.searchText.includes(normalizedQuery));
        return {
          ...section,
          packages,
        };
      })
      .filter((section) => section.packages.length > 0);
  }, [normalizedQuery, sections]);
  const totalPackages = useMemo(
    () => sections.reduce((sum, section) => sum + section.packages.length, 0),
    [sections],
  );
  const visiblePackages = useMemo(
    () => filteredSections.reduce((sum, section) => sum + section.packages.length, 0),
    [filteredSections],
  );
  const summary = normalizedQuery.length > 0
    ? `许可 ${filteredSections.length}/${sections.length} · 包 ${visiblePackages}/${totalPackages}`
    : `许可 ${sections.length} · 包 ${totalPackages}`;

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
        <div className="settings-dialog-body settings-licenses-body">
          <div className="settings-licenses-toolbar">
            <label className="settings-licenses-search">
              <span className="settings-licenses-search-icon" aria-hidden="true">⌕</span>
              <input
                className="settings-licenses-search-input"
                type="search"
                placeholder="搜索包名、描述、作者或主页"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                aria-label="搜索开源许可包"
              />
            </label>
            <div className="settings-licenses-summary" aria-live="polite">
              {summary}
            </div>
          </div>
          <div className="settings-licenses-hint">支持搜索包名、描述、作者、主页或版本。</div>
          <div className="settings-licenses-list">
            {filteredSections.map((section) => (
              <details key={section.license} className="settings-license-group" open={normalizedQuery.length > 0}>
                <summary className="settings-license-summary">
                  <span className="settings-license-summary-title">
                    <span className="settings-license-toggle" aria-hidden="true">▸</span>
                    <span>{section.license}</span>
                  </span>
                  <span className="settings-license-count">{section.packages.length} 个包</span>
                </summary>
                <div className="settings-license-items">
                  {section.packages.map((pkg) => {
                    const hasMeta = Boolean(pkg.author || pkg.homepage);
                    const versionKey = pkg.versionText ? `-${pkg.versionText}` : "";
                    return (
                      <div key={`${section.license}-${pkg.name}${versionKey}`} className="settings-license-item">
                        <div className="settings-license-title">
                          <strong>{pkg.name}</strong>
                          {pkg.versionText ? <span className="settings-license-version">{pkg.versionText}</span> : null}
                        </div>
                        {pkg.description ? <p className="settings-license-desc">{pkg.description}</p> : null}
                        {hasMeta ? (
                          <div className="settings-license-sub">
                            {pkg.author ? <span>作者：{pkg.author}</span> : null}
                            {pkg.homepage ? (
                              <a className="settings-license-link" href={pkg.homepage} target="_blank" rel="noreferrer">
                                主页
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
            {filteredSections.length === 0 ? (
              <div className="settings-licenses-empty">没有匹配的许可或包。</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
