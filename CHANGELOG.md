# Changelog

Novedades de Setto por versión. Lo lee Ajustes → Acerca de → "Ver novedades".

## 2.14.0 (sin publicar)

### Gastos
- Presupuesto por categoría: en "Presupuestos…" ponés un tope mensual para cada categoría (variables y de servicios) y, si querés, un total. El Resumen muestra una barra por categoría ordenada por lo que usaste (amarilla desde el 80 %, roja al pasarte) y avisos como "Superaste Supermercado por $ 12.000"; Inicio muestra las 2 categorías más comprometidas.
- Gastos recurrentes que se cargan solos: marcá un gasto como "Se repite" (todos los meses, semanas o años) o escribí "netflix 5000 todos los meses" en el agregado rápido. Al abrir Gastos o Inicio se cargan los vencidos (recupera hasta 3 meses, nunca duplica) con un aviso "Cargamos N gastos recurrentes" y Deshacer. Nueva vista Recurrentes para pausar, editar o eliminar.

### Portapapeles
- Buscar en todo lo copiado, también dentro de las capturas: la búsqueda de la barra flotante, del módulo Portapapeles y de Ctrl+K usa una búsqueda única en main sobre los textos (historial y fijados; nunca los sensibles) y las capturas (texto de la imagen por OCR, nota, ticket, app y ventana), ordenada por frase exacta > todas las palabras > parecido (tolera errores de tipeo) y lo más reciente. Cada resultado muestra el texto que coincidió con las palabras resaltadas, el tipo y la miniatura de las capturas. En la barra: filtros Todo · Texto · Capturas, Enter pega como siempre y Alt+Enter copia el texto de una captura.
- OCR en segundo plano: las capturas nuevas se leen al momento (cola, de a una) y las viejas sin texto se completan de a poco (2 por minuto mientras usás la compu, 6 si está quieta), así la búsqueda alcanza el historial sin cargar la máquina.

### Tickets
- Nuevo módulo Tickets: un lugar por ticket (WIGOS-132764). Lista los tickets que aparecen en lo copiado, las capturas (ticket asignado o texto de la imagen), las notas (incluido el Bloc), los snippets y los archivos recientes del editor, ordenados por última actividad y con cuántas referencias hay de cada fuente; se pueden buscar, fijar y agregar a mano. La página del ticket junta capturas (arrastrables), notas, snippets, copiados y archivos, con título opcional, «Abrir en Jira» (URL de Conexiones), «Comentario de evidencia», «Nueva nota del ticket» (plantilla Resumen / Análisis / Pasos / Pendientes) y «Exportar todo» (carpeta con las imágenes y un .md). Escribir una clave en Ctrl+K abre su página. Los copiados sensibles nunca aparecen.
- El módulo de IA que analizaba tickets ahora se llama «Resolver con IA».

### Claves
- Nuevo: sincronizar contraseñas entre computadoras (Claves → ⋯ → Sincronizar contraseñas). Se cifran de extremo a extremo con una contraseña maestra que no sale de tu PC; en otra computadora, al ingresarla, aparecen las que faltan. Cada credencial muestra si está sincronizada o sólo en esta PC; si una contraseña difiere y no se sabe cuál es más nueva, no se pisa: queda en «Conflicto» y elegís cuál usar (con Deshacer). Se puede cambiar la contraseña maestra o desactivar (borra las copias de la nube). Requiere correr la migración 004 en Supabase; en modo local no está disponible.
- Claves con el estilo de líneas finas: ítem activo como tarjeta con borde fino, encabezados de sección chicos en mayúsculas y atajos en chips.

### Diseño
- Nuevo estilo de líneas finas: barra lateral clara con la marca, el buscador (Ctrl K) y secciones plegables; el módulo activo es una tarjeta blanca con borde fino.
- El contenido va en un panel flotante con bordes redondeados; el encabezado claro muestra el módulo actual, "Nuevo" y los controles de ventana.
- Íconos de trazo fino en toda la app y botones de contorno con forma de píldora.

### Diseño: Inicio, Gastos, Conexiones, Ajustes y Utilidades
- Inicio más tranquilo: "Hola" y la fecha en una línea, sin halo de color; los widgets son tarjetas blancas con borde fino y encabezado chico.
- Gastos: gráficos de trazo fino (barras finas sin degradé, ejes y grilla grises, dona más delgada que pasa la leyenda abajo si no entra); filtros de Movimientos en una sola fila; los "Rápidos" son píldoras de contorno.
- Tarjetas de indicadores, conexiones y estados vacíos con íconos grises en tile de borde fino (sin tiles lila ni degradés); controles segmentados claros con el segmento activo blanco.
- Conexiones: la descripción de cada servicio ya no se corta y el estado va en su propia línea. Ajustes y Utilidades marcan la sección activa como tarjeta blanca con borde fino. Acerca de en una tarjeta simple, sin halo.

### Diseño: Snippets, Portapapeles, Editor, Terminal, API Lab, Repos, Comparar y Tickets
- Los paneles laterales internos son grises como la barra de la app, con filas de 30 px y el ítem activo como tarjeta blanca con borde fino; encabezados de sección chicos en mayúsculas.
- Barras de herramientas de 42 px con línea fina abajo; filtros, etiquetas y lenguajes como píldoras de borde fino; tarjetas blancas con borde fino en lugar de rellenos grises.
- Terminal: las sesiones son píldoras sobre una barra clara. API Lab: pestañas en píldora y panel más ancho para que no se corten. Tickets: pasos y tarjetas sin rellenos de color.
- Ctrl+K, modales, paneles laterales, la búsqueda en archivos y los avisos: blancos con borde fino, sombra suave, 14 px de radio y encabezado y pie separados por líneas finas. La ventana de atajos ya no encima las descripciones largas.

### Comodidad
- Al cerrar la ventana con cambios sin guardar, Setto pregunta antes de perderlos.
- Ctrl+Z deshace la última acción con "Deshacer" (borrar una clave, un snippet, un gasto…), salvo mientras escribís.
- Al abrir una versión nueva se muestran sus novedades una sola vez.

### Plataforma
- Instalador mucho más liviano: los paquetes que sólo usa la interfaz ya no se copian aparte (se empaquetan con Vite) y se quitaron dependencias sin uso (devicon, vscode-material-icons, openai, electron-store).
- Ninguna clave de servicio queda dentro de la app: la de Supabase se configura en Conexiones → Supabase.
- Actualizaciones: los chequeos automáticos ya no muestran errores cuando no hay versiones publicadas o no hay red. "Buscar actualizaciones" a mano en Ajustes → Acerca de; el aviso muestra el progreso de la descarga y los errores, con "Reintentar".
- Más estable: un error en segundo plano ya no cierra la app (se registra y se avisa); si una ventana falla al cargar aparece una pantalla con "Recargar"; las consolas de Terminal se cierran al salir.
- Datos más seguros: un archivo cifrado que no se puede leer se aparta como `.corrupt-<fecha>` en vez de pisarse; las escrituras cifradas son atómicas; el historial del portapapeles y el índice de Capturas hacen copia antes de reescribir.
- Capturas: la limpieza automática nunca borra las fijadas, anotadas o con ticket, nota o etiquetas, y manda a la papelera del sistema en vez de borrar.
- Sincronización: se cancela (con un mensaje claro) si la carpeta de notas no está disponible, si en esta PC no hay nada pero en la nube sí, o si borraría más del 30 % de lo remoto.
- Arranque más rápido: la ventana principal carga ~26 % menos JavaScript al abrir (íconos sin los estilos que no se usan, Novedades y Markdown se cargan cuando hacen falta).
- Cada ventana sólo puede usar lo suyo: la barra flotante y el selector de snippets no acceden a la terminal, archivos, ajustes ni respaldos (también se verifica en el proceso principal).
- API Lab: los scripts pre/post corren en un hilo aislado con límite de memoria y se cortan a los 2 s pase lo que pase.
- Privacidad en Notas y Editor: la vista previa de Markdown ya no descarga imágenes de internet por su cuenta; aparece "Cargar imagen remota" y se baja sólo si hacés clic. Se quitan iframes y videos remotos.
- Restaurar un respaldo es todo o nada: se prepara aparte, se valida y recién ahí reemplaza los datos (lo que no estaba en el respaldo se quita, con copia en `restore-backup-<fecha>`); si algo falla, todo queda como estaba.
- Más liviano en segundo plano: el sondeo de Capturas no hashea la imagen entera cada vez, el log no consulta el disco en cada línea y el respaldo automático espera a que la PC esté ociosa.
- Fuentes incluidas en la app (sin Google Fonts).
- La copia de desarrollo ya no registra atajos globales (no le roba los atajos a la app instalada).

### Gastos e Inicio
- Un gasto escrito en la captura rápida (Ctrl+Shift+Espacio) o en Inicio se guarda directo, con "Deshacer", sin salir de donde estás; sólo se abre Gastos si no se entiende el monto.
- Sin conexión los cambios quedan en este equipo y se suben en orden: ya no se pierden ediciones hechas mientras sincroniza, un cambio viejo no pisa uno nuevo y uno que Supabase rechaza se descarta con aviso en vez de trabar la cola.
- Se cargan todos los movimientos (antes se cortaba en 1000 por tabla), Supabase tiene 12 s para responder (nunca más "sincronizando" eterno) y los borrados hechos en otra PC se detectan al sincronizar.
- Inicio y el dock leen sólo los totales del mes, sin la carga completa. Cada widget de Inicio distingue "no conectado", "sin conexión (copia local)" y "error, Reintentar"; un error ya no se muestra como lista vacía.
- Inicio: los snippets con `{{variables}}` se completan ahí mismo; los archivos recientes abren en la línea guardada; los widgets se llaman "Claves" y "Portapapeles".
- Borrar un gasto o un pago usa el aviso con "Deshacer" de toda la app. Se quitó "Importar histórico 2024–2025".

### Claves, Portapapeles, Snippets, Barra y Conexiones
- Claves: mismas teclas en Ctrl+K, la barra y el módulo (Enter copia la contraseña, Shift+Enter el usuario); con PIN, Ctrl+K y la barra abren Claves, piden el PIN y copian. Sin Supabase (o en modo solo local) funciona tranquila: "Solo en esta computadora", sin reintentos ni avisos de sin conexión.
- Borrar una clave, un snippet, una captura o un copiado es inmediato con "Deshacer"; "Vaciar" el historial pide confirmación.
- Portapapeles: abre en Texto si no hay imágenes, deja de consultar cuando no está a la vista, el orden ya no se corta y Ctrl+K busca desde 2 letras (hasta 6 resultados).
- Pegar desde el selector o la barra devuelve lo que tenías copiado; si wscript falla se prueba PowerShell y si no, aviso "Copiado — pegalo con Ctrl+V".
- Utilidades conserva lo escrito en cada herramienta; Ctrl+K sólo carga su herramienta. Editor en Ctrl+K muestra recientes sin escribir y marca los que ya no existen.
- La barra aparece en el monitor del cursor y Claves ya no espera a Gastos. Conexiones muestra "Modo solo local" en Supabase.

### Navegación y bienvenida
- Sin pestañas arriba: la barra lateral es la navegación y la barra superior muestra el módulo actual. Los últimos 6 módulos usados conservan su estado (Terminal, Editor y los que tienen cambios sin guardar nunca se cierran) y se recuerda el último.
- Atajos: Ctrl+1…9 abre el módulo N de la barra lateral; Ctrl+` (y Ctrl+Tab fuera del Editor) recorre los recientes.
- Nombres unificados: Claves, Portapapeles, Conexiones; la barra plegada muestra el nombre completo (sólo Portapapeles → "Copiado" y Buscar en repos → "Repos", porque no entran).
- Bienvenida en el primer arranque (tema y tamaño, módulos, Supabase o modo solo local, atajos); se vuelve a ver desde Ajustes → Acerca de, donde también están "Buscar actualizaciones" y "Ver novedades".
- Avisos con acción ("Deshacer", 6 s), apilables, que se pausan con el mouse encima y se leen con lector de pantalla. Ctrl+K muestra "Recientes" sin escribir y la acción de Shift+Enter de cada resultado.
- Sincronización: si se frena por borrar muchas notas o snippets en la nube, Ajustes ofrece confirmar y reintentar.

### Bloc y barra flotante
- Nueva pestaña "Bloc" en la barra flotante: un anotador siempre a mano que se guarda solo (es la nota `Bloc.md`, así que se sincroniza con las notas). Muestra caracteres y líneas, y tiene "Copiar todo", "Limpiar" (con "Deshacer") y "Abrir en Notas" (activa el módulo si estaba oculto), más las 3 últimas notas.
- Con Ctrl+Alt+D y la pestaña Bloc activa, escribís directo en el Bloc. En Ctrl+K, "Bloc" abre la barra en esa pestaña.
- La barra flotante adopta el estilo de líneas finas: panel blanco con borde fino, pestañas con una raya debajo de la activa, botones de píldora y teclas en chips, en claro y oscuro.

## Cómo publicar una versión

1. Subir `version` en `package.json` (y `npm install` para actualizar el lock) y pasar "(sin publicar)" a la fecha en este archivo.
2. Commit en `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. El workflow `.github/workflows/release.yml` (Windows) instala, corre typecheck y tests, compila, verifica que no haya claves embebidas y publica el instalador en GitHub Releases. Las instalaciones existentes lo ven en el próximo chequeo (al abrir y cada 4 h) o con "Buscar actualizaciones".

`npm run package` arma el instalador localmente sin publicar nada (`--publish never`).
