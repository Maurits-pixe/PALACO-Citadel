import { useRef, useState } from 'react';
import { ArrowLeft, Building2, Code, Lock, ShieldAlert, Terminal, Users } from 'lucide-react';
import Aether from './Aether.jsx';
import Bastion from './Bastion.jsx';
import Scriptie from './Scriptie.jsx';

const modules = [
  {
    id: 'aether',
    name: 'AETHER',
    description: 'Versleutel of ontcijfer tekst lokaal in deze browser.',
    color: '#00ff9d',
    icon: Lock,
    Component: Aether
  },
  {
    id: 'bastion',
    name: 'BASTION',
    description: 'Een fictief commandocentrum voor teamcoördinatie.',
    color: '#3b82f6',
    icon: Users,
    Component: Bastion
  },
  {
    id: 'scriptie',
    name: '5CRIPTIE',
    description: 'Een visuele simulatie met uitsluitend synthetische gegevens.',
    color: '#bd00ff',
    icon: Code,
    Component: Scriptie
  }
];

export default function PalacoLauncher() {
  const [activeModule, setActiveModule] = useState(null);
  const cardRefs = useRef({});
  const active = modules.find(module => module.id === activeModule);

  function returnToMenu() {
    setActiveModule(null);
    requestAnimationFrame(() => cardRefs.current[activeModule]?.focus());
  }

  if (active) {
    const Module = active.Component;
    return (
      <main className="module-screen">
        <header className="module-toolbar">
          <button className="back-button" type="button" onClick={returnToMenu}>
            <ArrowLeft size={18} aria-hidden="true" />
            Terug naar PALACO
          </button>
          <h1>{active.name}</h1>
          <a className="standalone-link" href={active.id === 'aether' ? '/citadel/iii6v9/' : active.id === 'bastion' ? '/citadel/bastion/' : '/citadel/aegis/'}>
            Apart openen
          </a>
        </header>
        <Module />
      </main>
    );
  }

  return (
    <main className="launcher">
      <header className="launcher-header">
        <div className="brand">
          <Building2 size={36} aria-hidden="true" />
          <div>
            <p className="eyebrow">PALACO SYSTEMS</p>
            <h1>PALACO HOOFDKANTOOR</h1>
          </div>
        </div>
        <div className="access-label">
          <Terminal size={17} aria-hidden="true" />
          MODULEVOORBEELDEN
        </div>
      </header>

      <section className="boundary-notice" aria-labelledby="boundary-title">
        <ShieldAlert size={22} aria-hidden="true" />
        <div>
          <h2 id="boundary-title">CONCEPTVOORBEELDEN · GEEN OPERATIONELE DIENSTEN</h2>
          <p>
            AETHER versleutelt lokaal maar is geen gecontroleerde kluis; Bastion is geen
            beveiligde teamcommunicatie; 5CRIPTIE gebruikt synthetische gegevens en monitort
            geen echte systemen. Deze launcher verleent geen toegang of bevoegdheid.
          </p>
        </div>
      </section>

      <section className="module-menu" aria-labelledby="menu-title">
        <p className="eyebrow">KIES EEN MODULE</p>
        <h2 id="menu-title">PALACO Hoofdkantoor</h2>
        <p className="menu-description">Open een van de bestaande modulevoorbeelden.</p>

        <div className="module-grid">
          {modules.map(({ id, name, description, color, icon: Icon }) => (
            <button
              className="module-card"
              data-module={id}
              key={id}
              ref={element => { cardRefs.current[id] = element; }}
              style={{ '--module-color': color }}
              type="button"
              onClick={() => setActiveModule(id)}
            >
              <span className="card-mark" aria-hidden="true"><Icon size={34} /></span>
              <span className="card-name">{name}</span>
              <span className="card-description">{description}</span>
              <span className="card-action">OPEN VOORBEELD <ArrowLeft size={15} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      </section>

      <footer className="launcher-footer">
        De launcher is alleen navigatie; elke module behoudt zijn eigen beperkingen.
      </footer>
    </main>
  );
}
