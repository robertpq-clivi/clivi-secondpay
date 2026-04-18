# Clonar y configurar clivi-secondpay en otra Mac

## Paso 1 — Verificar dependencias

```bash
node --version   # Necesitas v18 o superior
git --version
```

Si no tienes Node.js:
```bash
# Instalar Homebrew (si no lo tienes)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node
brew install node
```

---

## Paso 2 — Configurar Git

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
```

---

## Paso 3 — Autenticarte en GitHub

```bash
brew install gh
gh auth login
```

Sigue el wizard: **GitHub.com → HTTPS → Login with a web browser**

---

## Paso 4 — Clonar el repo

```bash
git clone https://github.com/robertpq-clivi/clivi-secondpay.git
cd clivi-secondpay
npm install
```

---

## Paso 5 — Crear el archivo de variables de entorno

```bash
touch .env.local
open -e .env.local
```

Pega esto (pide los valores a Roberto):

```
CHARGEBEE_SITE=
CHARGEBEE_API_KEY=
HUBSPOT_ACCESS_TOKEN=
```

Guarda y cierra.

---

## Paso 6 — Correr el proyecto

```bash
npm run dev
```

Abre **http://localhost:3000** — PIN de acceso: pídelo a Roberto.

---

## Paso 7 — Flujo diario

```bash
# Al iniciar: jalar los cambios más recientes
git pull origin main

# Al terminar:
git add .
git commit -m "feat: lo que hiciste"
git push origin main
```

---

## Si trabajan en paralelo al mismo tiempo

Cada quien trabaja en su propia rama para evitar conflictos:

```bash
# Crear rama para tu feature
git checkout -b feat/nombre-de-lo-que-vas-a-hacer

# Trabajas, haces commits normalmente...

# Al terminar, merge a main
git checkout main
git pull origin main
git merge feat/nombre-de-lo-que-vas-a-hacer
git push origin main
```
