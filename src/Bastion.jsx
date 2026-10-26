export default function Bastion({ iframeRef, onLoad }) {
  return (
    <iframe
      className="module-frame"
      ref={iframeRef}
      src="/citadel/bastion-app/"
      title="BASTION · team prototype"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
    />
  );
}
