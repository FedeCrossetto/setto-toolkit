import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { coerceWeight, stripPhosphorWeights } from './phosphor-weights'

const SAMPLE = `import * as e from "react";
const a = /* @__PURE__ */ new Map([
  [
    "bold",
    /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("path", { d: "M1,2Z" }))
  ],
  [
    "duotone",
    /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("path", { d: "M3,4Z", opacity: "0.2" }), /* @__PURE__ */ e.createElement("path", { d: "M5]6" }))
  ],
  [
    "fill",
    /* @__PURE__ */ e.createElement(e.Fragment, null)
  ],
  [
    "light",
    /* @__PURE__ */ e.createElement(e.Fragment, null)
  ],
  [
    "regular",
    /* @__PURE__ */ e.createElement(e.Fragment, null)
  ],
  [
    "thin",
    /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("path", { d: "M7,8Z" }))
  ]
]);
export { a as default };`

function weightsOf(code: string): string[] {
  // Evaluar el Map con un createElement falso.
  const fn = new Function('e', code.replace(/^import.*$/m, '').replace(/export \{ a as default \};?/, 'return a;'))
  const map = fn({ createElement: () => null, Fragment: null }) as Map<string, unknown>
  return [...map.keys()]
}

describe('stripPhosphorWeights', () => {
  it('quita thin y duotone y deja JS válido', () => {
    const out = stripPhosphorWeights(SAMPLE)
    expect(out).not.toContain('"duotone"')
    expect(out).not.toContain('"thin"')
    expect(weightsOf(out)).toEqual(['bold', 'fill', 'light', 'regular'])
  })

  it('respeta la lista de pesos a conservar', () => {
    expect(weightsOf(stripPhosphorWeights(SAMPLE, ['thin']))).toEqual(['thin'])
    expect(weightsOf(stripPhosphorWeights(SAMPLE, ['bold', 'duotone', 'fill', 'light', 'regular', 'thin']))).toHaveLength(6)
  })

  it('no toca código que no reconoce', () => {
    expect(stripPhosphorWeights('export default 1')).toBe('export default 1')
  })

  it('funciona con un ícono real del paquete', () => {
    const req = createRequire(import.meta.url)
    const pkg = path.dirname(req.resolve('@phosphor-icons/react/package.json'))
    const code = readFileSync(path.join(pkg, 'dist/defs/Acorn.es.js'), 'utf8')
    const out = stripPhosphorWeights(code)
    expect(out.length).toBeLessThan(code.length * 0.75)
    const fn = new Function('e', out.replace(/^import.*$/m, '').replace(/export\s*\{[^}]*\};?\s*$/, 'return a;'))
    const map = fn({ createElement: () => null, Fragment: null }) as Map<string, unknown>
    expect([...map.keys()].sort()).toEqual(['bold', 'fill', 'light', 'regular'])
  })
})

describe('coerceWeight', () => {
  it('reemplaza pesos no incluidos', () => {
    expect(coerceWeight('thin')).toBe('light')
    expect(coerceWeight('duotone')).toBe('regular')
    expect(coerceWeight('fill')).toBe('fill')
  })
})
