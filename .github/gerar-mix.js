/* =============================================================
   GERADOR DO images.json
   -------------------------------------------------------------
   Roda sozinho no GitHub a cada vez que a Gabriela sobe um arquivo.
   Ela nunca abre isto - so arrasta a foto para a pasta da colecao.

   REGRA CENTRAL: pasta = colecao. Nome do arquivo = titulo.
   Tudo o mais e opcional e vive no mix.config.json.
   ============================================================= */
const fs = require("fs");
const path = require("path");

const RAIZ = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || "USUARIO/REPOSITORIO";
const BRANCH = process.env.GITHUB_REF_NAME || "main";
const CDN = "https://cdn.jsdelivr.net/gh/" + REPO + "@" + BRANCH + "/";

const EXT_IMG = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const EXT_VID = /\.(mp4|webm|mov|m4v|ogv)$/i;

/* Pastas que nao sao colecao. O ponto e o sublinhado sao a convencao:
   qualquer pasta que comece com eles fica de fora, entao ela pode ter
   um `_rascunhos/` sem que ele vire uma colecao no site. */
const ignorar = (n) => n.startsWith(".") || n.startsWith("_") || n === "node_modules";

/* "ouro-preto_2024.jpg" -> "Ouro Preto 2024"
   O nome do arquivo e a unica fonte de titulo que existe sem ela
   digitar nada, entao vale limpar bem. */
const titulo = (arquivo) =>
  path.basename(arquivo, path.extname(arquivo))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

const url = (p) => CDN + p.split(path.sep).map(encodeURIComponent).join("/");

/* Ajustes opcionais por colecao. Se o arquivo nao existir, tudo bem:
   o gerador deduz tudo. Ele so existe para quando ela QUISER mandar. */
let config = { collections: {} };
const caminhoConfig = path.join(RAIZ, "mix.config.json");
if (fs.existsSync(caminhoConfig)) {
  try {
    const lido = JSON.parse(fs.readFileSync(caminhoConfig, "utf8"));
    if (lido && typeof lido === "object") config = { collections: lido.collections || {} };
  } catch (e) {
    console.error("mix.config.json invalido, seguindo sem ele:", e.message);
  }
}

/* DETALHES POR FOTO: um `_info.json` dentro da propria pasta.
   Fica ao lado das fotos, e a chave e so o nome do arquivo - nao o
   caminho inteiro. Caminho longo e onde ela erraria digitando.
   O `_` na frente ja faz o gerador ignorar o arquivo como imagem.

   Aceita duas formas, e a curta existe porque na maioria das vezes ela
   so vai querer a frase:
     "foto.jpg": "A frase que aparece grande"
     "foto.jpg": { "name": "...", "phrase": "...", "link": "..." } */
const lerInfo = (dir) => {
  const caminho = path.join(dir, "_info.json");
  if (!fs.existsSync(caminho)) return {};
  try {
    const lido = JSON.parse(fs.readFileSync(caminho, "utf8"));
    return (lido && typeof lido === "object") ? lido : {};
  } catch (e) {
    console.error("_info.json invalido em " + dir + ", seguindo sem ele: " + e.message);
    return {};
  }
};

/* Procura pelo nome do arquivo, COM e SEM extensao: escrever
   "ouro-preto" ou "ouro-preto.jpg" tem que dar no mesmo. */
const acharInfo = (info, arquivo) => {
  const nome = path.basename(arquivo);
  const semExt = path.basename(arquivo, path.extname(arquivo));
  const bruto = info[nome] !== undefined ? info[nome] : info[semExt];
  if (bruto === undefined) return {};
  if (typeof bruto === "string") return { phrase: bruto };
  return (bruto && typeof bruto === "object") ? bruto : {};
};

/* lista os arquivos de uma pasta, inclusive subpastas */
const listar = (dir, base) => {
  const saida = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    if (ignorar(nome)) continue;
    const cheio = path.join(dir, nome);
    const rel = base ? path.join(base, nome) : nome;
    if (fs.statSync(cheio).isDirectory()) saida.push(...listar(cheio, rel));
    else if (EXT_IMG.test(nome) || EXT_VID.test(nome)) saida.push(rel);
  }
  return saida;
};

const itens = [];
const colecoes = [];

const montar = (arquivos, nomeColecao, info) => {
  /* CAPA DE VIDEO por nome igual: "reel.mp4" + "reel.jpg" viram UM item
     com poster, nao dois. Sem isto a capa apareceria como se fosse uma
     obra separada, duplicando tudo na grade. */
  const posters = new Set();
  for (const a of arquivos) {
    if (!EXT_VID.test(a)) continue;
    const semExt = a.slice(0, a.length - path.extname(a).length);
    for (const b of arquivos) {
      if (EXT_IMG.test(b) && b.slice(0, b.length - path.extname(b).length) === semExt) {
        posters.add(b);
      }
    }
  }

  const conf = config.collections[nomeColecao] || {};
  for (const a of arquivos) {
    if (posters.has(a)) continue;
    const ehVid = EXT_VID.test(a);
    const d = acharInfo(info || {}, a);
    /* o nome sai do ARQUIVO por padrao: renomear a foto ja resolve o
       titulo, sem abrir arquivo nenhum. O `_info.json` so entra quando
       ela quiser um nome diferente do nome do arquivo. */
    const item = { name: String(d.name || d.nome || titulo(a)) };
    const frase = d.phrase || d.frase || d.description;
    if (frase) item.phrase = String(frase);
    if (d.link) item.link = String(d.link);
    if (ehVid) {
      item.video = url(a);
      const semExt = a.slice(0, a.length - path.extname(a).length);
      const capa = [...posters].find(
        (b) => b.slice(0, b.length - path.extname(b).length) === semExt
      );
      if (capa) item.image = url(capa);
    } else {
      item.image = url(a);
    }
    if (nomeColecao) item.collection = conf.name || nomeColecao;
    /* tag: a da foto manda; senao a da colecao; senao o nome da pasta.
       Assim os filtros ja nascem funcionando e ela ajusta so o que quiser. */
    const tag = d.tag !== undefined ? d.tag
      : (conf.tag === undefined ? nomeColecao : conf.tag);
    if (tag) item.tag = tag;
    itens.push(item);
  }
};

/* --- as pastas viram colecoes --- */
const pastas = fs.readdirSync(RAIZ)
  .filter((n) => !ignorar(n) && fs.statSync(path.join(RAIZ, n)).isDirectory())
  .sort();

for (const pasta of pastas) {
  const arquivos = listar(path.join(RAIZ, pasta), pasta);
  if (!arquivos.length) continue;
  const antes = itens.length;
  montar(arquivos, pasta, lerInfo(path.join(RAIZ, pasta)));
  const conf = config.collections[pasta] || {};
  const primeira = itens.slice(antes).find((i) => i.image);
  colecoes.push({
    name: conf.name || pasta,
    cover: conf.cover ? url(path.join(pasta, conf.cover)) : (primeira ? primeira.image : ""),
    link: conf.link || "",
    _ordem: conf.order === undefined ? 999 : conf.order,
  });
}

/* --- arquivos soltos na raiz: entram no All, sem colecao --- */
const soltos = fs.readdirSync(RAIZ)
  .filter((n) => !ignorar(n) && fs.statSync(path.join(RAIZ, n)).isFile()
    && (EXT_IMG.test(n) || EXT_VID.test(n)))
  .sort();
if (soltos.length) montar(soltos, "", lerInfo(RAIZ));

colecoes.sort((a, b) => (a._ordem - b._ordem) || a.name.localeCompare(b.name));
for (const c of colecoes) delete c._ordem;

const saida = { collections: colecoes, items: itens };
fs.writeFileSync(path.join(RAIZ, "images.json"), JSON.stringify(saida, null, 2) + "\n");

console.log("images.json: " + itens.length + " itens em " + colecoes.length + " colecoes");
for (const c of colecoes) {
  console.log("  - " + c.name + ": " + itens.filter((i) => i.collection === c.name).length);
}
