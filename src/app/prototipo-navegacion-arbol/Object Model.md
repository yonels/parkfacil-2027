# Object Model - ParkFacil Object Explorer (Iteracion 4)

## 1) Que es un objeto
Un objeto es una definicion declarativa que representa una entidad de negocio o un elemento organizador.

Campos base de ObjectDefinition:
- id: identificador unico.
- type: tipo semantico (empresa, tarifa, turno, caja, etc.).
- label: nombre visible.
- icon: clave de icono.
- description: descripcion funcional.
- parent: id del padre.
- children: lista de hijos (se calcula por Tree Builder).
- properties: propiedades de la ficha.
- actions: acciones demo.
- status: estado funcional (demo, activo, programado, etc.).
- permissions: permisos requeridos (solo metadato en prototipo).
- visible: si se muestra en el Explorer.
- expanded: estado inicial de expansion.
- badge: indicador opcional.
- searchable: habilita indexacion para busqueda.
- sortable: habilita ordenamiento futuro.
- metadata: informacion extra para extensiones.

## 2) Que es un contenedor
Un contenedor es un objeto cuyo rol es ordenar otros objetos.
No contiene logica de negocio: solo estructura.

Ejemplos usados:
- estacionamientos
- off_street
- on_street
- configuracion
- operacion_diaria
- recaudacion
- administracion
- reportes
- activacion

## 3) Que es una accion
Una accion es metadata del objeto.
El panel la renderiza como botones demo.

Ejemplos:
- Tarifa: Editar, Duplicar, Historial, Nueva version.
- Operador: Editar, Cambiar turno, Bloquear.
- Caja: Abrir, Cerrar, Arqueo.
- Dispositivo: Diagnostico, Configurar, Reiniciar.

## 4) Como se construye el arbol
1. Se registra un array plano de ObjectDefinitions.
2. Tree Builder indexa por id.
3. Tree Builder une relaciones parent/children automaticamente.
4. Tree Builder genera:
   - roots
   - rows (para render jerarquico)
   - parentById (breadcrumb y expansion)

El componente del arbol no conoce ParkFacil: solo recibe objetos.

## 5) Como registrar un nuevo objeto
Agregar una nueva definicion al modelo con su parent.

Ejemplo:
- id: off-centro-camara-norte
- type: camara
- label: Camara Norte
- parent: off-centro-dispositivos
- icon: ScanLine
- properties: { Estado: "Online", Firmware: "v1.0.4" }
- actions: ["Diagnostico", "Configurar", "Reiniciar"]

No se modifica el arbol ni el panel.
Aparece automaticamente por relaciones.

## 6) Como registrar un nuevo contenedor
Agregar objeto tipo contenedor con parent.

Ejemplo:
- id: off-centro-plugins
- type: contenedor
- label: Plugins
- parent: off-centro
- icon: FolderCog

Luego registrar hijos de ese contenedor.

## 7) Como extender a otra aplicacion
Para usar el mismo Explorer en otra aplicacion:
1. Crear un archivo de definiciones de objetos de ese dominio.
2. Reutilizar Tree Builder.
3. Reutilizar componentes de arbol, busqueda, breadcrumb y panel.
4. Cambiar solo datos (ObjectDefinitions), no componentes.

Con esto se soporta crecimiento hacia IA, Marketplace, ERP, CRM, GPS, Reservas, Carga Electrica o Valet Parking registrando nuevos objetos.
