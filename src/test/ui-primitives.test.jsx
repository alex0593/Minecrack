// ui-primitives.test.jsx — contrato de las primitivas del design system (Fase 1)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Tabs from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import Skeleton from '../components/ui/Skeleton';
import Tooltip from '../components/ui/Tooltip';
import Card from '../components/ui/Card';
import { ToastViewport, toast } from '../components/ui/Toast';
import ErrorModal from '../components/ui/ErrorModal';

afterEach(() => {
  act(() => {
    toast.clear();
  });
});

describe('Button', () => {
  it('compone las clases globales .btn por variante y tamaño', () => {
    render(<Button variant="primary" size="sm">Jugar</Button>);
    const btn = screen.getByRole('button', { name: 'Jugar' });
    expect(btn).toHaveClass('btn', 'btn-primary', 'btn-sm', 'ui-btn');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('usa type=button por defecto (no submittea formularios)', () => {
    render(<Button>Acción</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('loading deshabilita el botón y no dispara onClick', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Guardar</Button>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('pinta el icono cuando se pasa', () => {
    render(<Button icon="🎮">Jugar</Button>);
    expect(screen.getByText('🎮')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Input', () => {
  it('renderiza etiqueta y pista', () => {
    render(<Input label="Nombre" hint="Visible en la lista" />);
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Visible en la lista')).toBeInTheDocument();
    expect(document.querySelector('input.input.ui-input')).toBeTruthy();
  });

  it('marca errores con clase, aria-invalid y role=alert', () => {
    render(<Input label="Versión" error="Obligatorio" />);
    const input = document.querySelector('input');
    expect(input).toHaveClass('ui-input--error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Obligatorio');
  });

  it('sin label/hint/error devuelve el input suelto', () => {
    const { container } = render(<Input placeholder="Buscar" />);
    expect(container.querySelector('label')).toBeNull();
    expect(document.querySelector('input')).toBeTruthy();
  });
});

describe('Modal', () => {
  it('renderiza título, subtítulo, cuerpo y footer', () => {
    render(
      <Modal open onClose={() => {}} title="Título" subtitle="Sub" footer={<button>Ok</button>}>
        <p>cuerpo</p>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Título' })).toBeInTheDocument();
    expect(screen.getByText('Sub')).toBeInTheDocument();
    expect(screen.getByText('cuerpo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ok' })).toBeInTheDocument();
  });

  it('Esc cierra aunque el foco esté en un input (hallazgo 2)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="T">
        <input data-testid="campo" />
      </Modal>
    );
    fireEvent.keyDown(screen.getByTestId('campo'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('el overlay cierra (mousedown) pero el contenido no propaga', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose} title="T">
        <p>cuerpo</p>
      </Modal>
    );
    fireEvent.mouseDown(container.querySelector('.ui-modal'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('.ui-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('el botón × llama a onClose y se puede ocultar', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open onClose={onClose} title="T" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Modal open onClose={onClose} title="T" showClose={false} />);
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('open=false no pinta nada y bloquea el scroll solo abierto', () => {
    const { rerender } = render(<Modal open={false} onClose={() => {}} title="T" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');

    rerender(<Modal open onClose={() => {}} title="T" />);
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'mods', label: 'Mods' },
    { id: 'stats', label: 'Stats', badge: 3 },
    { id: 'off', label: 'Off', disabled: true },
  ];

  it('renderiza items con roles y aria-selected correctos', () => {
    render(<Tabs items={items} value="mods" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Mods/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Stats/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /Stats/ }).querySelector('.ui-tab__badge')).toBeTruthy();
  });

  it('al pulsar llama onChange con el id y no con los deshabilitados', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="mods" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Stats/ }));
    expect(onChange).toHaveBeenCalledWith('stats');
    onChange.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: /Off/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('la pestaña activa lleva la clase ui-tab--active', () => {
    render(<Tabs items={items} value="stats" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /Stats/ })).toHaveClass('ui-tab--active');
    expect(screen.getByRole('tab', { name: /Mods/ })).not.toHaveClass('ui-tab--active');
  });
});

describe('Badge / Spinner / Skeleton / Tooltip / Card', () => {
  it('Badge pinta el tono solicitado', () => {
    render(<Badge tone="success">Listo</Badge>);
    expect(screen.getByText('Listo')).toHaveClass('ui-badge', 'ui-badge--success');
  });

  it('Spinner es accesible y acepta tamaño', () => {
    render(<Spinner size="lg" label="Cargando partida" />);
    const spinner = screen.getByRole('status', { name: 'Cargando partida' });
    expect(spinner).toHaveClass('ui-spinner--lg');
  });

  it('Skeleton pinta N líneas y colapsa con lines=1', () => {
    const { rerender } = render(<Skeleton lines={4} />);
    expect(document.querySelectorAll('.ui-skeleton')).toHaveLength(4);
    rerender(<Skeleton lines={1} width="50%" />);
    expect(document.querySelectorAll('.ui-skeleton')).toHaveLength(1);
    expect(document.querySelector('.ui-skeleton').style.width).toBe('50%');
    expect(document.querySelector('.ui-skeleton').getAttribute('aria-hidden')).toBe('true');
  });

  it('Tooltip expone la burbuja como role=tooltip con la colocación', () => {
    render(
      <Tooltip content="Ayuda" placement="bottom">
        <button>?</button>
      </Tooltip>
    );
    const bubble = screen.getByRole('tooltip');
    expect(bubble).toHaveTextContent('Ayuda');
    expect(bubble).toHaveClass('ui-tooltip__bubble--bottom');
  });

  it('Card aplica padding y variante hover', () => {
    render(<Card pad="lg" hover data-testid="card">contenido</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('ui-card', 'ui-card--pad-lg', 'ui-card--hover');
  });
});

describe('Toast', () => {
  it('toast.show pinta el aviso y dismiss lo retira', () => {
    render(
      <>
        <button onClick={() => toast.show('Partida iniciada', { duration: 0 })}>disparar</button>
        <ToastViewport />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    expect(screen.getByText('Partida iniciada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Partida iniciada')).toBeNull();
  });

  it('los helpers success/error fijan el tono', () => {
    render(
      <>
        <button onClick={() => toast.success('OK', { duration: 0 })}>s</button>
        <button onClick={() => toast.error('Fallo', { duration: 0 })}>e</button>
        <ToastViewport />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 's' }));
    expect(document.querySelector('.ui-toast--success')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    expect(document.querySelector('.ui-toast--danger')).toBeTruthy();
  });
});

describe('ErrorModal (migrado a Modal)', () => {
  it('renderiza mensaje, detalles y acciones', () => {
    render(
      <ErrorModal
        message="No se pudo lanzar"
        details="stack trace"
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText('No se pudo lanzar')).toBeInTheDocument();
    expect(screen.getByText('DETALLES TÉCNICOS:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '📋 Copiar' })).toBeInTheDocument();
  });

  it('Esc cierra el modal de error (antes no lo hacía)', () => {
    const onClose = vi.fn();
    render(<ErrorModal message="boom" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('open=false no pinta nada', () => {
    render(<ErrorModal message="x" onClose={() => {}} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
