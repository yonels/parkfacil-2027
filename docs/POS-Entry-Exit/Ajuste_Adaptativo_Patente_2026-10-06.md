# ParkFacil — POS Entry/Exit: pantalla e ingreso de patente

Corrección posterior a QA física del commit 9e5f18b: el panel cabía pero dejaba un área inferior amplia sin aprovechar.

En pantallas de hasta 600 píxeles CSS, el login extiende su fondo hasta la altura disponible. El inicio operativo distribuye el espacio restante entre las dos filas de botones y mantiene un margen exterior de 6 píxeles. El alto proviene del WebView/visualViewport; las vistas de operación conservan desplazamiento cuando su contenido o el teclado lo requieren.

El ingreso manual usa campos separados de letras y números. Al completar cuatro letras el foco pasa al campo con inputMode=numeric. Un selector permite el formato antiguo de dos letras y cuatro números. Pegar una patente completa conserva ambos formatos; Backspace sobre números vacíos devuelve el foco a las letras. La validación y confirmación existentes siguen aplicándose al valor combinado.

Validación: ESLint sin errores; build webpack y pruebas de navegador con APIs ficticias. Pantallas: 320×568, 360×640, 360×800, 480×960 y 640×360. En orientación horizontal se permite desplazamiento vertical. No sustituye QA física del teclado Android ni validación de cobro, impresión o TUU.

Publicar solo en release/qr-onstreet-1.0. No se requiere otra APK para estos cambios web. Confirmar Preview Ready, cerrar y abrir la app y verificar ingreso AAAA-91, formato AB-1234, edición y teclado. La publicación se ejecuta desde el PC porque la integración GitHub de esta sesión rechazó escritura con 403.
