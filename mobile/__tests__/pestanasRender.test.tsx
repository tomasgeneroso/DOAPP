// @ts-nocheck -- react-test-renderer no trae tipos en este proyecto; la prueba solo mira que el componente se dibuje y responda
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import Pestanas from '../components/ui/Pestanas';
import { ThemeProvider } from '../context/ThemeContext';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) }));

/** El componente de pestañas se dibuja, marca la opción elegida y avisa al tocar otra. */
describe('Pestanas (celular)', () => {
  it('marca la elegida, muestra la insignia y avisa al tocar otra', async () => {
    const cambios: string[] = [];
    let arbol!: renderer.ReactTestRenderer;
    await act(async () => {
      arbol = renderer.create(
        <ThemeProvider>
          <Pestanas
            etiqueta="Prueba"
            valor="a"
            onCambiar={(id) => cambios.push(id)}
            opciones={[
              { id: 'a', texto: 'Uno' },
              { id: 'b', texto: 'Dos', insignia: 3 },
            ]}
            testID="p"
          />
        </ThemeProvider>,
      );
    });
    // El proveedor del tema carga su preferencia de forma asíncrona: se espera a que aparezcan las pestañas (con carga alta tarda más: se le dan hasta 10 s; sale apenas aparecen).
    for (let i = 0; i < 500 && arbol.root.findAll((n) => n.props.accessibilityRole === 'tab').length === 0; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    const tabs = arbol.root.findAll((n) => n.props.accessibilityRole === 'tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    const elegidas = tabs.filter((t: any) => t.props.accessibilityState?.selected);
    expect(elegidas.map((t: any) => t.props.testID)).toContain('p-a');
    const textos = JSON.stringify(arbol.toJSON());
    expect(textos).toContain('Uno');
    expect(textos).toContain('Dos');
    expect(textos).toContain('3');
    const segunda = tabs.find((t: any) => t.props.testID === 'p-b')!;
    act(() => segunda.props.onPress());
    expect(cambios).toEqual(['b']);
  }, 20000);
});
