export function TitleBar(): JSX.Element {
  const minimize = (): void => window.api.send('window:minimize')
  const maximize = (): void => window.api.send('window:maximize')
  const close = (): void => window.api.send('window:close')

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[200] flex items-center justify-end px-3 gap-1"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={minimize}
          className="w-3 h-3 rounded-full bg-outline-variant/40 hover:bg-on-surface-variant/60 transition-colors"
          title="Minimize"
        />
        <button
          onClick={maximize}
          className="w-3 h-3 rounded-full bg-outline-variant/40 hover:bg-on-surface-variant/60 transition-colors"
          title="Maximize"
        />
        <button
          onClick={close}
          className="w-3 h-3 rounded-full bg-outline-variant/40 hover:bg-error transition-colors"
          title="Close"
        />
      </div>
    </div>
  )
}
