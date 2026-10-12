# Reporte diario en Netlify

## Contenido
- `public/index.html`: inicio. Tiene el botón «Crear reporte» y el acceso de administradores (usuario `colombia_solar`).
- `public/reporte.html`: el formulario. Es el enlace que se comparte con las gestoras: `https://TU-SITIO.netlify.app/reporte`
- `netlify/functions/api.mjs`: el servidor. Guarda los reportes y asigna el código `AAAAMMDD-###`.
- Base de datos: Netlify Blobs. Viene incluida con Netlify y no hay que configurarla.

## Cómo publicarlo (elige una opción)

**Opción A: Netlify Drop (arrastrar la carpeta)**
1. Inicia sesión en app.netlify.com. Es obligatorio: si publicas sin sesión, Netlify no instala nada y el servidor no se activa.
2. En «Projects» (o «Sites»), arrastra la carpeta `netlify-deploy` completa a la zona de «Drag and drop».
3. Espera a que termine el despliegue y abre la dirección que te asignan.

**Opción B: GitHub (recomendada para actualizaciones)**
1. Sube el contenido de `netlify-deploy` a un repositorio.
2. En Netlify: «Add new project» → «Import an existing project» → elige el repositorio. Netlify toma la configuración de `netlify.toml`.

**Opción C: Netlify CLI**
```
npm install -g netlify-cli
cd netlify-deploy
npm install
netlify deploy --prod
```

## Comprobar que funciona
- Abre `https://TU-SITIO.netlify.app/api/session`. Debe responder `{"ok":false}`. Si ves un error 404, el servidor no se publicó: vuelve a publicar con sesión iniciada o usa la opción B o C.
- Crea un reporte de prueba desde el celular y luego búscalo en el panel desde otro equipo.

## Variables opcionales
En Project configuration → Environment variables:
- `ADMIN_USER`: cambia el usuario del panel. Por defecto es `colombia_solar`.
- `SESSION_SECRET`: clave para firmar las sesiones. Si no la defines, se genera una automáticamente.
