# Mi día fuera de Claude — guía paso a paso

Tu web quedará en: **https://jperezalonso005-cyber.github.io/mi-dia/**
Hazlo mejor con el ordenador. Son unos 20 minutos en total.

---

## 1. Subir la web a GitHub (5 min)

**Opción A: lo hago yo.** Reconecta GitHub en Claude con tu cuenta `jperezalonso005-cyber` y dímelo.

**Opción B: a mano.**
1. Entra en `github.com/jperezalonso005-cyber/mi-dia`.
2. Pulsa **Add file → Upload files**.
3. Arrastra **todos los archivos de la carpeta `web`** (no la carpeta en sí) y pulsa **Commit changes**.
4. Ve a **Settings → Pages**, elige Branch **main** y carpeta **/ (root)**, y pulsa **Save**.
5. En 1 o 2 minutos la web estará en la dirección de arriba.

---

## 2. Supabase: donde se guardan tus datos (7 min)

1. Entra en **supabase.com** → **Start your project** (puedes entrar con GitHub).
2. Pulsa **New project**:
   - **Nombre:** `mi-dia`.
   - **Contraseña:** inventa una y guárdala (no la usarás en la app).
   - **Región:** Europa (por ejemplo, *West EU (Ireland)*).
   - Pulsa **Create**.
3. Cuando esté listo, abre **SQL Editor → New query**. Pega esto y pulsa **Run**:

```sql
create table if not exists docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, col, id)
);
alter table docs enable row level security;
alter table docs replica identity full;
create policy "solo lo mio" on docs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter publication supabase_realtime add table docs;
```

4. Ve a **Authentication → Sign In / Providers → Email** y **desactiva "Confirm email"**. Así no tienes que confirmar por correo. Si prefieres dejarlo activado, también vale: solo tendrás que confirmar una vez.
5. Ve a **Authentication → URL Configuration** y pon en **Site URL**: `https://jperezalonso005-cyber.github.io/mi-dia/`
6. Ve a **Project Settings → API** (o **API Keys**) y copia estos dos datos:
   - **Project URL**, que es como `https://xxxx.supabase.co`.
   - **anon public key** (o **Publishable key**).

Esa clave es pública. Tus datos solo los puedes ver tú, porque cada fila queda ligada a tu usuario.

---

## 3. Google Calendar (10 min, es opcional pero lo quieres)

1. Entra en **console.cloud.google.com** y crea un proyecto llamado `Mi dia`.
2. Ve a **APIs y servicios → Biblioteca**, busca **Google Calendar API** y pulsa **Habilitar**.
3. Ve a **Google Auth Platform** (o *Pantalla de consentimiento de OAuth*) → **Empezar**:
   - **Nombre de la aplicación:** `Mi día`. Pon tu correo.
   - **Público:** **Externo**.
   - Acepta y pulsa **Crear**.
4. En **Público** (Audience), ve a **Usuarios de prueba → Añadir** y pon `jperezalonso05@gmail.com`.
5. En **Clientes**, pulsa **Crear cliente** y elige **Aplicación web**:
   - **Orígenes de JavaScript autorizados:** `https://jperezalonso005-cyber.github.io`
   - **URIs de redireccionamiento autorizados:** `https://jperezalonso005-cyber.github.io/mi-dia/`
   - Pulsa **Crear** y copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

Cuando conectes el calendario, Google te avisará de que la app no está verificada. Es normal, porque es tuya: pulsa **Continuar**.

---

## 4. Primera vez en la web

1. Abre la web y te saldrá **Configurar Mi día**. Pega la URL y la clave de Supabase, el Client ID de Google y tu Gmail, y pulsa **Guardar y seguir**.
2. Pulsa **Crear cuenta**: pon tu email y una contraseña, y después **Entrar**.
3. **Para pasar tus datos de la versión de Claude:**
   - En la versión de Claude: **Más → Datos → Copiar mis datos**.
   - En la web nueva: **Más → Datos → Traer datos** → pega → **Importar**.
4. En **Agenda**, pulsa **Conectar Google Calendar** y acepta.

En el otro dispositivo (móvil u ordenador) solo tienes que repetir el paso 1 con los mismos datos y **Entrar** con la misma cuenta.

---

## 5. Accesos rápidos

- **iPhone:**
  - Safari → abre la web → **Compartir → Añadir a pantalla de inicio**.
  - O con **Atajos → Abrir URL** con la dirección de la web → **Añadir a pantalla de inicio**.
- **Ordenador:**
  - Chrome → **⋮ → Enviar, guardar y compartir → Crear acceso directo… → Abrir como ventana**.
  - Safari en Mac → **Archivo → Añadir al Dock**.

---

### A tener en cuenta
- **Google cada hora:** el permiso de Google dura 1 hora. Si caduca, en la Agenda te sale **Conectar Google Calendar**. Un toque y vuelve, sin volver a pedirte permisos.
- **Sin conexión:** la app funciona; los cambios se guardan cuando vuelve internet.
- **Versión de Claude:** sigue funcionando a la vez, pero sus datos van aparte (están en Claude).
