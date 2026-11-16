# Inspector Android (Capacitor) — Multa de Cortesía / MTP-II

Etapa 3 final de Inspector (2026-08-31). **No es una segunda app**: es la
misma web/PWA Inspector que ya existe (`/inspector` en `parkfacil-2027`),
empaquetada con [Capacitor](https://capacitorjs.com/) en modo
`server.url` — Capacitor carga la app REAL desde su origen (auth, APIs,
RBAC, fiscalización, GPS, cámara/evidencias, SMS, todo tal cual), y
únicamente le agrega el plugin nativo `ParkFacilPrinter` (Bluetooth
Classic SPP) para imprimir en la GOOJPRT MTP-II.

## Por qué existe esto (resumen de la auditoría)

- La MTP-II es **Bluetooth Clásico (SPP)**, no BLE — confirmado en el
  agente de impresión de PC ya funcionando
  (`C:\proyectos\parkfacil-print-agent`: la impresora está emparejada
  como puerto COM6 virtual de Windows).
- **Web Bluetooth solo habla BLE** — no puede alcanzar un dispositivo SPP
  clásico desde NINGÚN navegador ni PWA instalada, en Android ni en iOS.
  Por eso `printerAdapter.js` (en `src/lib/inspector/` del repo Next.js)
  ya no ofrece una vía Web Bluetooth para esta impresora.
- La única vía real desde Android es un **plugin nativo** (fuera del
  sandbox del navegador) — este directorio prepara exactamente eso.
- **iOS queda bloqueado a nivel de plataforma**, no de código: Apple solo
  permite Bluetooth Clásico a accesorios certificados MFi, y GOOJPRT no
  tiene esa certificación (ver informe completo en la respuesta de esta
  tarea). Ni una app nativa Capacitor-iOS podría conectarse a esta
  impresora tal como es hoy.

## Qué YA está listo en este repositorio (Next.js, verificado con `npm test`/`lint`/`build`)

- `src/lib/inspector/escposCore.mjs` — primitivos ESC/POS, réplica exacta
  (mismos comandos, misma codificación latin1) de `escpos.js` del agente
  de PC ya probado contra la MTP-II real.
- `src/lib/inspector/courtesyTicketEscPos.mjs` — arma el ticket "MULTA DE
  CORTESÍA" con esos primitivos.
- `src/lib/inspector/printerAdapter.js` — capa `ParkFacilDevice`/
  `PrinterAdapter`: detecta navegador/PWA vs Android Capacitor vs iOS
  Capacitor, y expone `connect/disconnect/getStatus/printBytes/
  listPairedPrinters` delegando al plugin nativo `window.Capacitor.
  Plugins.ParkFacilPrinter` cuando existe. Sin ese plugin (navegador
  normal, o Android sin este wrapper), informa la razón real en vez de
  fingir que funciona.
- `src/components/inspector/CourtesyTicketPrint.js` — UI completa:
  conectar impresora (lista de emparejados), estado (●Conectada/No
  conectada), imprimir, reimprimir, reconexión automática con la
  impresora guardada (`localStorage`, solo id/nombre, nunca secretos).
- `capacitor-inspector-android/native/android/ParkFacilPrinterPlugin.kt`
  — el plugin nativo Android COMPLETO (Bluetooth Classic SPP real, UUID
  estándar `00001101-0000-1000-8000-00805F9B34FB` de Serial Port
  Profile — no es un UUID inventado, es el mismo en cualquier
  dispositivo SPP).

Todo lo anterior tiene tests (`node --test`) y pasa lint/build. **Lo que
NO se puede hacer en este entorno** (sin Android Studio/SDK/dispositivo
físico) es lo que sigue.

## Qué falta — requiere Android Studio

1. **Instalar Android Studio + Android SDK** (no están disponibles en este
   entorno de trabajo).
2. Desde la raíz de `parkfacil-2027`:
   ```bash
   npm install @capacitor/core @capacitor/android
   npm install -D @capacitor/cli
   npx cap init "ParkFacil Inspector" "cl.parkfacil.inspector" --web-dir=www
   ```
   (o copia el `capacitor.config.json` de esta carpeta al root del
   proyecto, ajustando `server.url` a la IP LAN real o al dominio de
   producción).
3. ```bash
   npx cap add android
   ```
   Esto genera la carpeta `android/` (proyecto Gradle real) — recién ahí
   existen las rutas `android/app/src/main/...` que se mencionan abajo.
4. Copiar `native/android/ParkFacilPrinterPlugin.kt` a
   `android/app/src/main/java/cl/parkfacil/inspector/
   ParkFacilPrinterPlugin.kt` (crear las carpetas de paquete si no
   existen).
5. Aplicar `native/android/AndroidManifest.additions.xml` dentro de
   `android/app/src/main/AndroidManifest.xml` (los `<uses-permission>`
   van fuera de `<application>`).
6. Aplicar `native/android/MainActivity.additions.txt` (registrar el
   plugin) en `android/app/src/main/java/.../MainActivity.java` (o
   `.kt`, según lo que genere Capacitor).
7. Abrir el proyecto `android/` en Android Studio, dejar que sincronice
   Gradle, y compilar/ejecutar en un dispositivo Android real (Bluetooth
   no funciona en el emulador).

Nada de esto puede compilarse ni verificarse con `npm test`/`npm run
build` de `parkfacil-2027` — son herramientas de Android, no de Node/
Next.js. Por eso queda documentado aquí en vez de simulado como
"terminado".

## Prueba física — Android (una vez compilado)

1. Emparejar la MTP-II en **Ajustes de Bluetooth de Android** (una sola
   vez, fuera de Inspector — PIN/confirmación estándar de Android).
2. Abrir la app Inspector (APK instalado desde Android Studio).
3. Autenticarse con una cuenta Inspector real.
4. En "Impresora", tocar **Conectar impresora** → elegir "MTP-II" (o el
   nombre que muestre) de la lista de emparejados.
5. Confirmar que el estado cambia a **● Conectada**.
6. Consultar una patente con sesión **VENCIDA**.
7. Fiscalizar (confirmar "vehículo presente").
8. Tocar **IMPRIMIR MULTA DE CORTESÍA** → verificar que el ticket sale
   físicamente de la MTP-II con el formato exacto.
9. Tocar **IMPRIMIR NUEVAMENTE** (reimpresión) → confirmar que sale un
   ticket IDÉNTICO (misma patente/fecha/folio) y que NO se crea una
   fiscalización nueva (revisar el historial de Inspector: debe seguir
   habiendo una sola).
10. **Apagar la MTP-II** y tocar imprimir de nuevo → debe mostrarse "No
    fue posible imprimir. La fiscalización ya fue registrada." con
    **REINTENTAR IMPRESIÓN**, sin afectar la fiscalización ya guardada.
11. Encender la MTP-II de nuevo, tocar **Conectar impresora** → confirmar
    que reconecta y vuelve a imprimir correctamente.
12. Cerrar y volver a abrir la app → confirmar que intenta reconectar
    solo con la impresora ya autorizada antes (sin pedir elegirla de
    nuevo), gracias a la persistencia en `localStorage`.

## iOS

No hay nada que compilar todavía: la MTP-II, tal como es, **no tiene una
vía real de conexión desde iOS** (ni Web, ni Capacitor nativo — es una
limitación de la impresora, no de esta app). Si en el futuro se define
usar otra impresora (BLE nativo, o certificada MFi), `printerAdapter.js`
ya está preparado para un tercer caso `PLATFORM.IOS` con su propio plugin
nativo (`ios/App/App/ParkFacilPrinterPlugin.swift`, análogo al de
Android) — no requiere rediseñar nada de lo ya construido, solo agregar
esa pieza el día que exista un transporte real que la soporte.
