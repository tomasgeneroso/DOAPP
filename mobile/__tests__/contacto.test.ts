jest.mock('../services/api', () => ({ __esModule: true, post: jest.fn() }));
import { post } from '../services/api';
import { armarContacto, enviarContacto, interpretarContacto, validarContacto, LIMITE_MENSAJE, LIMITE_NOMBRE } from '../services/contacto';

const mockPost = post as jest.Mock;
const valido = { nombre: 'Ana Pérez', correo: 'ana@correo.com', asunto: 'support', mensaje: 'No me carga la pantalla de pagos.' };

describe('validarContacto', () => {
  it('acepta un mensaje completo', () => {
    expect(validarContacto(valido)).toBeNull();
  });

  it('rechaza lo que el servidor rechazaría', () => {
    expect(validarContacto({ ...valido, nombre: '   ' })).toMatch(/nombre/);
    expect(validarContacto({ ...valido, nombre: 'a'.repeat(LIMITE_NOMBRE + 1) })).toMatch(/nombre/);
    expect(validarContacto({ ...valido, correo: 'ana@' })).toMatch(/correo/);
    expect(validarContacto({ ...valido, correo: 'ana correo@x.com' })).toMatch(/correo/);
    expect(validarContacto({ ...valido, asunto: 'advertising' })).toMatch(/asunto/);
    expect(validarContacto({ ...valido, mensaje: 'corto' })).toMatch(/mensaje/);
    expect(validarContacto({ ...valido, mensaje: 'x'.repeat(LIMITE_MENSAJE + 1) })).toMatch(/mensaje/);
  });

  it('los espacios no cuentan para el largo mínimo', () => {
    expect(validarContacto({ ...valido, mensaje: '   hola      ' })).toMatch(/mensaje/);
  });
});

describe('enviarContacto', () => {
  beforeEach(() => mockPost.mockReset());

  it('manda los campos recortados, sin sesión', async () => {
    mockPost.mockResolvedValue({ success: true });
    const r = await enviarContacto({ ...valido, nombre: '  Ana  ', mensaje: '  No me carga la pantalla de pagos.  ' });
    expect(r.ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/contact', { name: 'Ana', email: 'ana@correo.com', subject: 'support', message: 'No me carga la pantalla de pagos.' }, false);
  });

  it('no llama al servidor si los datos no pasan', async () => {
    const r = await enviarContacto({ ...valido, correo: '' });
    expect(r.ok).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('un rechazo del servidor no se muestra como enviado', async () => {
    mockPost.mockResolvedValue({ success: false, message: 'Server error' });
    expect(await enviarContacto(valido)).toEqual({ ok: false, mensaje: 'Server error' });
  });
});

describe('interpretarContacto', () => {
  it('traduce los errores de validación (traen `errors`, no `message`) a campos', () => {
    const r = interpretarContacto({ success: false, errors: [{ path: 'email' }, { param: 'message' }, { path: 'email' }, { path: 'raro' }] });
    expect(r).toEqual({ ok: false, mensaje: 'Revisá estos datos: correo, mensaje.' });
  });

  it('sin success: true nunca es ok', () => {
    expect(interpretarContacto(undefined).ok).toBe(false);
    expect(interpretarContacto({ success: 'true' }).ok).toBe(false);
    expect(interpretarContacto({ success: true }).ok).toBe(true);
  });

  it('armarContacto no manda campos de más', () => {
    expect(Object.keys(armarContacto(valido)).sort()).toEqual(['email', 'message', 'name', 'subject']);
  });
});
