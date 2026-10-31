export default function Aether({ iframeRef, onLoad }) {
  return (
    <iframe
      className="module-frame"
      ref={iframeRef}
      src="/citadel/iii6v9/"
      title="AETHER · lokale versleuteling"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
    />
  );
}
