# Gerador de Evidencias Corporativas

Aplicacao web profissional em Next.js (App Router) para padronizacao e geracao de evidencias de compliance, auditoria, LGPD e seguranca da informacao.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- UI componentizada no estilo shadcn/ui
- React Hook Form
- Zustand (persistencia local)
- Canvas API (processamento de imagem client-side)
- EXIF parsing com exifr
- Pronto para deploy na Vercel

## Funcionalidades implementadas

- Upload seguro de imagens PNG/JPG/JPEG (com limite de tamanho)
- Leitura automatica de data via EXIF quando disponivel
- Fallback de data para ultima modificacao e depois data atual
- Quadro informativo configuravel nos 4 cantos:
	- Superior esquerdo
	- Superior direito
	- Inferior esquerdo
	- Inferior direito
- Campos dinamicos de evidencia:
	- Empresa de origem (predefinida)
	- Empresa destinataria
	- Titulo da evidencia
	- Numero da evidencia
	- Numero da questao
	- Data da imagem
	- Data de emissao
	- Responsavel (opcional)
	- Area/Departamento (opcional)
- Fundo do quadro configuravel (solido ou semitransparente)
- Marca d'agua opcional
- Preview em tempo real
- Exportacao em alta resolucao
- Nome de arquivo padronizado:
	- `EVIDENCIA_[NUMERO]_[EMPRESA]_[DATA].png`
- Download automatico ao gerar
- Historico local das ultimas configuracoes
- Tema claro/escuro
- Layout responsivo em estilo dashboard corporativo
- Tela de login com UX no mesmo padrao do projeto e-SignMail_SLICE
- Sessao autenticada com cookie JWT (login, logout e endpoint /api/auth/me)

## Como executar

```bash
npm install
npm run dev
```

Aplicacao disponivel em `http://localhost:3000`.

## Login

- URL: `http://localhost:3000/login`
- Usuario padrao: `infra` (ou `infra@slice.global`)
- Senha padrao: `infra`

Voce pode sobrescrever por variaveis de ambiente:

- `AUTH_USER_ID`
- `AUTH_NAME`
- `AUTH_USERNAME`
- `AUTH_EMAIL`
- `AUTH_PASSWORD`
- `JWT_SECRET`

## Qualidade e validacao

```bash
npm run lint
npm run build
```

## Deploy na Vercel

1. Conecte o repositorio na Vercel.
2. Framework detectado automaticamente: `Next.js`.
3. Comando de build: `npm run build`.
4. Output: padrao do Next.js.

## Estrutura principal

- `src/app`: rotas App Router e estilos globais
- `src/components`: dashboard, providers e componentes de UI
- `src/store`: estado global e historico local (Zustand)
- `src/lib`: metadados EXIF, processamento em canvas e utilitarios
- `src/types`: tipos centrais da aplicacao

## Roadmap de expansao

- Autenticacao e controle por perfil
- Persistencia em banco de dados
- Assinatura digital de evidencias
- Trilhas de auditoria e logs
- Geração em lote e templates por cliente
