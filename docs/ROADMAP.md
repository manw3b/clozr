# Clozr — Roadmap y modelo de producto

> **Para qué este documento:** capturar las decisiones de visión, modelo
> de negocio y arquitectura que afectan cómo se debe escribir nuevo
> código en Clozr. Cuando aparezca una duda del estilo "¿esto debería
> ser free o paid?" / "¿esto vive a nivel user o workspace?" / "¿vale
> la pena hacer X o lo dejamos para después?", la respuesta empieza acá.
>
> Si lo que leés acá entra en conflicto con lo que vas a implementar,
> **paralo y discutilo** — el documento es la fuente de verdad sobre el
> rumbo. Si el rumbo cambió, actualizalo antes de codear.
>
> **Última actualización del modelo:** 2026-05 (post-charla sobre nichos como add-ons)

---

## 1. Visión del producto

Clozr es un **CRM de escritorio para pequeños negocios en Argentina** (LATAM
después) que arranca como "salida del Excel" y escala a operación
multi-PC en tiempo casi-real.

**Target inicial:** emprendedor o equipo de 2-5 personas que ya vende
hace un tiempo pero gestiona todo en planillas / WhatsApp / cabeza. No
está listo para Salesforce, demasiado para Notion.

**Vertical primero:** revendedores Apple Argentina (iPhones, MacBooks,
accesorios). Origen del producto. El dogfood se hace acá.

**Estrategia de expansión:** otros nichos (autos, ropa, gastronomía,
servicios) se agregan UNO POR UNO con un cliente real piloto. Nunca
se diseña en abstracto.

**Form factor primario:** desktop (Tauri 2) para uso intensivo. Web
lite vendría después con feature parity reducida.

---

## 2. Modelo de negocio

Tres capas de monetización **independientes**:

```
┌─────────────────────────────────────────────────────────┐
│  Clozr FREE — gratis para siempre                        │
│  ─ CRM genérico funcional                                │
│  ─ Local-only (SQLite, single PC)                        │
│  ─ Sin equipo, sin cloud sync                            │
│  ─ Industry: "generic"                                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Suscripción Pro (mensual / anual)                       │
│  Desbloquea features cross-cutting:                      │
│  ─ Cloud sync (Turso/Worker) — equipo multi-PC           │
│  ─ Workspaces múltiples                                  │
│  ─ Reportes avanzados                                    │
│  ─ Backup cloud                                          │
│  ─ Updates de nichos comprados                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Add-ons de Nicho — compra individual                    │
│  Cada nicho se compra por separado:                      │
│                                                          │
│  • Electrónica (iPhones, gadgets, etc)                   │
│  • Automotive (autos / motos)                            │
│  • Fashion (ropa)                                        │
│  • Food (gastronomía / delivery)                         │
│  • Services (servicios profesionales)                    │
│                                                          │
│  Cada uno trae catálogo seed, pipeline custom, WA        │
│  templates, custom fields, reportes específicos.         │
└─────────────────────────────────────────────────────────┘
```

### Reglas del modelo

- **Free es honesto y útil**, no una versión rota. Un emprendedor solo
  puede usar Clozr Free meses sin dolor. El upgrade a Pro viene cuando
  *quiere que su equipo lo vea* o *quiere que su rubro venga pre-armado*.
- **Los nichos pertenecen al user para siempre** (modelo de "compra"
  estilo licencia software). Las **updates de un nicho** se reciben
  solo con Pro activo. Si baja de Pro, mantiene lo que ya tiene del
  nicho pero no recibe templates/seeds nuevos.
- **Pro y nichos son ortogonales.** Pro sin nichos comprados = Clozr
  genérico + cloud + equipo. Nichos sin Pro = catálogo y pipeline del
  rubro, pero sin cloud sync. La combinación es lo "completo".

### Precios tentativos (a definir formalmente al lanzar paywall)

| | Tentativo USD | Nota |
|---|---|---|
| Free | — | — |
| Pro mensual | $15-25 | Cobrado en USD vía Stripe/MercadoPago |
| Pro anual | $150-220 | Descuento ~17% vs mensual |
| Nicho c/u (one-time) | $80-150 | Diferenciado por complejidad |
| Renovación updates de nicho | $20-30/año | Opcional, mantiene seeds frescos |

---

## 3. Arquitectura de tenancy

Tres niveles, **estrictamente independientes**:

```
USER                       ←  identidad (email + pwd-less auth)
  │
  ├─ plan                  ←  "free" | "pro" | "enterprise"
  ├─ owned_industries[]    ←  ["electronics", "automotive", ...]
  │
  └─ workspaces[]          ←  N negocios del user
       │
       └─ industry         ←  "generic" | uno de owned_industries
```

### Reglas

| | |
|---|---|
| Cantidad de workspaces | Free: 1. Pro: ilimitado. |
| Industries disponibles para asignar | Free: solo `"generic"`. Pro: `"generic"` + lo que esté en `owned_industries`. |
| Cambiar industry de un workspace existente | Permitido pero **destructivo opcional**: el catálogo/pipeline previo NO se borra; los seeds del nuevo nicho se ofrecen aplicar (con confirmación). |
| Compartir workspace con equipo | Solo Pro (necesita cloud sync). |
| Backup cloud del workspace | Solo Pro. Free hace backup local automático. |

### Capa de entitlements en código

Hoy NO existe — pero el espacio está preparado:

```
src/lib/entitlements.ts   ← futuro: hasFeature(), canUseIndustry()
src/lib/industries/       ← futuro: un .ts por nicho con su IndustryConfig
src/lib/permissions.ts    ← actual: matriz rol → permisos (role-based)
```

Mientras no haya paywall, todos los `hasFeature()` devuelven `true`.
Cuando se active el paywall, solo cambia esa función — el resto del
código ya consume del entitlement.

---

## 4. Stack y form factor

| | Desktop (Tauri 2) | Web (futuro) |
|---|---|---|
| Foco | Uso intensivo, todo el día | Acceso rápido, móvil |
| Pre-carga | Eager — top-5 pantallas cargadas en arranque | Lazy — todo on-demand |
| Modales | Lazy on-demand | Lazy on-demand |
| Splash | 3-4s con tips + pre-fetch de queries | 0-1s, splash minimal |
| Memoria | Acepta usar 200-300 MB | Optimizar agresivo |
| Offline | Funciona — SQLite local | Funciona limitado — IndexedDB |
| Sync | Polling adaptativo 5s/30s | WebSocket eventual |
| Equipo en cloud | Sí (con Pro) | Sí (con Pro) |

**Decisión clave:** desktop puede ser "pesado" porque está optimizado
para que el user lo abra a la mañana y use todo el día. Web va a
priorizar tiempo de primer paint. Mismo código base, diferentes config
de Vite por target.

---

## 5. Roadmap por fases

### Fase HOY (v1.3.5x)
- Clozr local-first funcional
- Cloud opcional con multi-tenant (R1-R5 completos)
- Sin paywall, sin nichos, sin plans
- iPhone Club como dogfood interno con datos reales

### Fase F — Polish y arquitectura silenciosa (próximos releases)

**Objetivo:** dejar el código listo para el paywall sin construirlo aún.

| Sub | Qué hace | Build/Schema |
|---|---|---|
| F.splash | Splash 3-4s con tips + pre-fetch de queries | Solo frontend |
| F.preload | Pre-cargar top-5 pantallas en background durante splash | vite.config + dynamic import() |
| F.navigation | Cleanup nav (Equipo duplicado, ANÁLISIS, agrupar tabs Ajustes) | Solo frontend |
| F.industry-schema | Agregar `industry` a workspace (default `"generic"`) | DB local + cloud_workspaces |
| F.entitlements | `entitlements.ts` con stubs `hasFeature()` `canUseIndustry()` | Solo frontend |
| F.plan-schema | Agregar `plan` y `owned_industries` a users | DB local + cloud users |
| F.industry-generic | Crear `industries/generic.ts` con config pelada | Solo frontend |

**Sin features visibles para el user.** Todo silencioso.

### Fase G — UX intensivo + multi-business UI

| Sub | Qué hace |
|---|---|
| G.topbar | Switcher de workspace mostrando ícono de industry |
| G.create-workspace | Onboarding pide industry al crear workspace (solo `"generic"` disponible por ahora) |
| G.multi-workspace | Pulir el flujo de tener 2+ workspaces para users que ya pueden hacerlo via cloud |

### Fase H — Cuando aparezca el primer cliente no-iPhone

- Crear `industries/<rubro>.ts` con seeds reales validados con ese cliente
- NO antes — no diseñes en abstracto

### Fase I — Paywall

| Sub | Qué hace |
|---|---|
| I.stripe | Integrar Stripe/MercadoPago (suscripción + one-time) |
| I.checkout-pro | UI de upgrade a Pro |
| I.checkout-industry | UI de compra de nicho individual |
| I.entitlements-real | Cambiar `hasFeature()` stubs por lectura real de plan + owned_industries |
| I.downgrade-flow | Soft downgrade: mantenés lo que tenés, no podés agregar más |

### Fase J+ (futuro lejano)

- Marketplace de templates (eventualmente)
- Web lite version
- Mobile app
- Multi-currency, multi-idioma para vender en LATAM/España
- Plugin system para nichos custom

---

## 6. Principios de diseño derivados del modelo

Cuando estés codeando y dudes, aplicá:

### Principio 1: Free debe ser usable y honesto
Si una feature core (crear cliente, registrar venta, ver pipeline) está
limitada en free, mal diseño. Lo que limita el free es **escala**
(cantidad de workspaces, equipo, sync) o **especificidad** (rubros pre-armados).

### Principio 2: Industry es WORKSPACE-level, plan es USER-level
- Un user con 3 negocios distintos puede tener 3 industries distintas.
- El plan paga features cross-workspace.
- Si dudás dónde poner una bandera nueva, preguntate: *"¿esto cambia
  según qué negocio estás mirando, o según quién soy yo?"*

### Principio 3: Modo "generic" debe funcionar de verdad
No es un placeholder roto. Pipeline 3-4 stages básicos, catálogo libre
sin seeds, WA templates mínimos, cero campos custom. **Funcional pero
pelado.** Todo lo que vendas en un nicho tiene que ser una mejora real
sobre eso.

### Principio 4: Los nichos pagados deben sentirse "magic"
Cuando alguien compra `electronics` y lo activa en un workspace nuevo,
debe sentir que la app "lo conoce". Catálogo precargado con iPhones,
pipeline con etapas reales del proceso de venta, WA templates argentinos.
El "wow" del onboarding paid es lo que justifica el precio.

### Principio 5: Nada se pierde al downgradear
Si compraste un nicho y bajás de Pro, el nicho sigue funcionando local.
Si tenés workspaces múltiples y bajás de Pro, no podés crear MÁS pero
los existentes siguen.

### Principio 6: Desktop puede ser pesado, web debe ser liviana
No te ates a "tiene que ser optimizado en todo". En Tauri estás
optimizando por experiencia del usuario que trabaja todo el día. En
web vas a optimizar por bounce rate del primer visitante.

### Principio 7: Cada decisión local↔cloud es por feature, no global
La capa `cloudCtx()` en cada `db/*.ts` permite que cada feature decida
independientemente. No hagas "cloud mode global" — eso pierde
flexibilidad.

### Principio 8: Permisos vienen de un solo lugar
`src/lib/permissions.ts` es la matriz de roles. Backend y frontend la
comparten. Para entitlements paid usá `src/lib/entitlements.ts`
(separado a propósito — son ortogonales).

### Principio 9: No diseñes para fantasmas
Si un nicho no tiene cliente piloto real, no lo construyas. Si una
feature no la pide nadie todavía, no la inventes. El roadmap futuro
es una hipótesis, no un commit.

### Principio 10: Refactor silencioso > big bang
Cuando llegue el paywall, los users actuales no deberían notar nada
roto. El schema cambia silencioso, los entitlements arrancan
permisivos, y se aprietan después.

---

## 7. Decisiones aún abiertas (a confirmar antes de implementar)

### Modelo de pago
- [ ] Pro mensual vs anual vs ambos
- [ ] Precio exacto del Pro (USD 15-25 tentativo)
- [ ] Precio diferenciado por nicho o flat
- [ ] Renovación de updates: opcional o forzada
- [ ] Bundle de "todos los nichos" eventual
- [ ] Política de refund (sugerido: 30 días sin preguntas)
- [ ] Trial de Pro al sign-up sí/no, cuántos días

### UX
- [ ] Topbar: rubro+negocio explícito vs solo ícono (decisión leaning hacia solo ícono)
- [ ] Splash duración exacta (3s vs 4s vs 5s)
- [ ] Equipo duplicado: matar sidebar y mantener en Ajustes, o al revés
- [ ] Sección ANÁLISIS: sacar header y mover Reportes a OPERACIONES

### Generic
- [ ] Pipeline default de `generic`: ¿qué etapas? Tentativo: "Nuevo → Contactado → Vendido → Perdido"
- [ ] WA templates default del generic: ¿hay alguna pre-armada o cero?

### Cuando aparezca un cliente del rubro X
- [ ] Construir `industries/<X>.ts` con ese cliente como validador
- [ ] No antes

---

## 8. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Free demasiado bueno → nadie paga | Cap claro: 1 workspace, sin equipo cloud, sin nichos pre-armados |
| Free demasiado malo → nadie usa | Validar con users reales que pueden usar Clozr Free meses sin dolor |
| Complejidad pricing comunicada mal | Pricing page con 3 columnas claras y un FAQ sobre nichos |
| Lock-in débil (nicho one-time) | Updates pagas vía Pro mantienen el incentivo de seguir suscripto |
| Pérdida de datos al downgrade | Soft downgrade — todo queda, no se borra, solo se restringe agregar más |
| Disperse cuando agregás muchos nichos | Política: un nicho cada 4-6 meses, con cliente piloto real validando |
| Costo cloud explota | Cloud sync solo en Pro — vos cobrás antes de pagar el costo |
| Soporte se complica con plan+nicho+workspace cruzados | Panel admin tuyo que muestra todo de un user en 1 pantalla |
| Inflación AR si cobrás en pesos | Cobrar en USD desde día 1 |
| Marca quemada por nicho cojo | Cada nicho launchea lento con cliente piloto que aprueba |

---

## 9. Cómo agregar un nicho nuevo (cuando llegue el momento)

Checklist obligatorio antes de empezar:

1. **Cliente piloto identificado** — un negocio real del rubro que va a
   usar el nicho mientras lo construís. Sin esto, no se construye.

2. **Investigación del rubro** — al menos 5 entrevistas con dueños del
   rubro entendiendo: qué venden, cómo es su pipeline, qué métricas
   miran, qué WhatsApps mandan, qué campos extra necesitan vs un cliente
   genérico.

3. **Documento de diseño** — un archivo `docs/industries/<rubro>.md`
   con los hallazgos: catálogo seed, pipeline stages, WA templates,
   custom fields, reportes específicos.

4. **Implementación**:
   - `src/lib/industries/<rubro>.ts` con la `IndustryConfig`
   - Tests unitarios de los seeds + lógica específica
   - Actualizar onboarding para que el nicho aparezca como elegible
   - Worker: cero cambios (es solo frontend + seeds)

5. **Validación con piloto** — el cliente usa el nicho 30 días antes
   del lanzamiento público.

6. **Pricing definido** — basado en la complejidad real del laburo + lo
   que el cliente piloto considera justo. Mínimo USD 80 (electrónica),
   más para los complejos.

7. **Landing page del nicho** — con screenshots reales del piloto.

8. **Launch** — soft launch a la lista de espera + post en RRSS.

Mínimo entre lanzamientos: **4-6 meses**. Mantener pocos nichos bien
servidos > muchos a medias.

---

## 10. Cómo leer este documento en el día a día

Cuando estés por escribir código y dudes:

| Pregunta | Sección a consultar |
|---|---|
| ¿Esto debería ser free o paid? | §2 Modelo de negocio + §6 principios 1-4 |
| ¿Dónde vive este campo (user/workspace/industry)? | §3 Arquitectura tenancy + §6 principio 2 |
| ¿Vale la pena construir esta feature ahora? | §5 Roadmap fases + §6 principio 9 |
| ¿Cómo se comporta esto en local vs cloud? | §6 principio 7 |
| ¿Cómo afecta esto al user que baje de Pro? | §6 principio 5 |
| ¿Debería agregar un nicho nuevo? | §9 checklist |
| ¿Esto rompe alguno de los principios? | §6 todos |

Si la duda no está cubierta acá, **antes de codear, agregalo a §7
(decisiones abiertas) y discutilo.** No improvises arquitectura.
