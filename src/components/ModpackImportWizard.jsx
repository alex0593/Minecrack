/**
 * ModpackImportWizard.jsx — Unified 4-step modpack import wizard
 *
 * PASO 1: BÚSQUEDA — Search with Modrinth/CurseForge tabs + filters
 * PASO 2: PREVIEW — Show modpack details, select version
 * PASO 3: CONFIGURACIÓN — Custom instance name, icon, RAM, JVM args
 * PASO 4: INSTALACIÓN — Progress tracking and completion
 */

import { useState, Component, Fragment } from 'react';
import Step1Search from './modpack-import-wizard/Step1Search';
import Step2Preview from './modpack-import-wizard/Step2Preview';
import Step3Config from './modpack-import-wizard/Step3Config';
import Step4Install from './modpack-import-wizard/Step4Install';
import './ModpackImportWizard.css';

const LOADERS_MODPACK = ['fabric', 'forge', 'quilt', 'neoforge'];

// Pasos del wizard (orden coherente con el indicador visual)
const WIZARD_STEPS = [
  { key: 'search', num: 1, label: 'Búsqueda' },
  { key: 'preview', num: 2, label: 'Vista previa' },
  { key: 'config', num: 3, label: 'Configuración' },
  { key: 'install', num: 4, label: 'Instalación' },
];

/** Indicador de pasos: activo = accent, completados = ✓ */
function StepsIndicator({ currentStep }) {
  const currentIdx = WIZARD_STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="wizard-steps-indicator">
      {WIZARD_STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <div className={`wizard-step-line ${i <= currentIdx ? 'done' : ''}`} aria-hidden="true" />
            )}
            <div
              className={`wizard-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className={`wizard-step-dot ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                {isDone ? '✓' : s.num}
              </span>
              <span className="wizard-step-name">{s.label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Error Boundary ─────────────────────────────────────────────────────────
class WizardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ModpackWizard] React render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="wizard-container">
          <div className="wizard-modal" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <h2 style={{ color: 'var(--red)', marginBottom: 12 }}>⚠️ Error en el Wizard</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
              {this.state.error?.message || 'Ocurrió un error inesperado'}
            </p>
            <button className="btn btn-primary" onClick={this.props.onClose}>Cerrar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─���─ Main Wizard Component ──────────────────────────────────��────────────────
export default function ModpackImportWizard({ onClose }) {
  const [currentStep, setCurrentStep] = useState('search');
  const [searchData, setSearchData] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [configData, setConfigData] = useState(null);

  const handleSearchNext = (data) => {
    setSearchData(data);
    setCurrentStep('preview');
  };

  const handlePreviewNext = (version) => {
    setPreviewData(version);
    setCurrentStep('config');
  };

  const handleConfigNext = (config) => {
    setConfigData(config);
    setCurrentStep('install');
  };

  return (
    <WizardErrorBoundary onClose={onClose}>
    <div className={`wizard-container ${currentStep === 'preview' ? 'wizard-container-compact' : ''}`}>
      <div className={`wizard-modal ${currentStep === 'preview' ? 'wizard-modal-compact' : ''}`}>
        {/* Step indicator */}
        <StepsIndicator currentStep={currentStep} />

        {/* Content */}
        <div className="wizard-content">
          {currentStep === 'search' && (
            <Step1Search onNext={handleSearchNext} />
          )}

          {currentStep === 'preview' && searchData && (
            <Step2Preview
              source={searchData.source}
              pack={searchData.pack}
              gameVersion={searchData.gameVersion}
              onNext={handlePreviewNext}
              onBack={() => setCurrentStep('search')}
            />
          )}

          {currentStep === 'config' && searchData && previewData && (
            <Step3Config
              pack={searchData.pack}
              version={previewData}
              source={searchData.source}
              gameVersion={searchData.gameVersion}
              onNext={handleConfigNext}
              onBack={() => setCurrentStep('preview')}
            />
          )}

          {currentStep === 'install' && searchData && previewData && configData && (
            <Step4Install
              source={searchData.source}
              pack={searchData.pack}
              version={previewData}
              gameVersion={searchData.gameVersion}
              config={configData}
              onClose={onClose}
            />
          )}
        </div>

        {/* Close button */}
        {currentStep !== 'install' && (
          <button
            className="wizard-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
    </div>
    </WizardErrorBoundary>
  );
}
