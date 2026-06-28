// Catálogo da documentação do projeto, servida DENTRO do dashboard admin.
// Os .md ficam no repositório; aqui são lidos do filesystem e convertidos para
// HTML (marked). Whitelist por slug — sem path traversal.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

export type DocMeta = { slug: string; title: string; file: string };

// Ordem = ordem de exibição na navegação.
export const DOCS: DocMeta[] = [
  { slug: "readme", title: "README — visão geral & uso", file: "README.md" },
  { slug: "api-cliente", title: "API do Cliente — leitura e filtros", file: "docs/api-cliente-filtros.md" },
  { slug: "arquitetura", title: "Arquitetura — como tudo se liga", file: "docs/ARQUITETURA.md" },
  { slug: "powerbi", title: "Integração Power BI", file: "docs/powerbi-integration.md" },
  { slug: "resumo", title: "Resumo do projeto", file: "RESUMO-PROJETO.md" },
];

const BY_SLUG = new Map(DOCS.map((d) => [d.slug, d]));

export function listDocs(): { slug: string; title: string }[] {
  return DOCS.map(({ slug, title }) => ({ slug, title }));
}

export function isValidDoc(slug: string): boolean {
  return BY_SLUG.has(slug);
}

// Lê o markdown do disco e devolve { title, html }.
export async function renderDoc(slug: string): Promise<{ title: string; html: string }> {
  const doc = BY_SLUG.get(slug);
  if (!doc) throw new Error(`Doc desconhecido: ${slug}`);
  const full = path.join(process.cwd(), doc.file);
  let md: string;
  try {
    md = await readFile(full, "utf8");
  } catch {
    md = `> Documento \`${doc.file}\` não encontrado no servidor.`;
  }
  const html = await marked.parse(md, { gfm: true, breaks: false });
  return { title: doc.title, html };
}
