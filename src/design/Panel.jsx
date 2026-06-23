/**
 * Unified panel chrome — shared header/body/footer for Workbench, Inspector, Feed.
 */
import { panelChrome } from './tokens.js'

/**
 * @param {Object} props
 * @param {string} [props.title]
 * @param {string} [props.provenance]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.children]
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.className]
 */
export default function Panel({
  title,
  provenance,
  actions,
  children,
  footer,
  className = '',
}) {
  return (
    <div className={`${panelChrome.root} ${className}`.trim()}>
      {(title || provenance || actions) && (
        <header className={panelChrome.header}>
          <div className="atlas-panel__header-main">
            {title && <h2 className={panelChrome.title}>{title}</h2>}
            {provenance && (
              <span className={panelChrome.provenance}>{provenance}</span>
            )}
          </div>
          {actions && <div className="atlas-panel__actions">{actions}</div>}
        </header>
      )}
      {children && <div className={panelChrome.body}>{children}</div>}
      {footer && <footer className={panelChrome.footer}>{footer}</footer>}
    </div>
  )
}
