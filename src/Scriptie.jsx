export default function Scriptie({ iframeRef, onLoad }) {
  return (
    <iframe
      className="module-frame"
      ref={iframeRef}
      src="/citadel/aegis/"
      title="5CRIPTIE · integriteitssimulatie"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
    />
  );
}
