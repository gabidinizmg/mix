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
     "foto.jpg": { "name": "...", "year": "2024", "archived": true, ... } */
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
/* IDIOMAS. O ingles e o padrao e mora nos campos de sempre (`name`,
   `phrase`) - assim tudo o que ja existe continua valendo e nada precisa
   ser migrado. As traducoes entram em blocos ao lado, e so quando
   escritas: `pt:{name,phrase}`, `es:{name,phrase}`.
   Traducao vazia cai no ingles na hora de mostrar; sem isso, trocar o
   idioma esvaziaria metade do site. */
const IDIOMAS = ["pt", "es"];
const traducoes = (fonte) => {
  const saida = {};
  for (const lg of IDIOMAS) {
    const t = fonte && fonte[lg];
    if (!t || typeof t !== "object") continue;
    const bloco = {};
    const nome = t.name || t.nome;
    const frase = t.phrase || t.frase || t.description;
    if (nome) bloco.name = String(nome);
    if (frase) bloco.phrase = String(frase);
    if (Object.keys(bloco).length) saida[lg] = bloco;
  }
  return saida;
};

/* Interruptor da info: desligado so quando esta escrito. Aceita texto
   porque um `_info.json` escrito na mao pode trazer "true". */
const semInfo = (o) => {
  const v = (o && o.noInfo !== undefined) ? o.noInfo : (o ? o.semInfo : undefined);
  return v === true || v === 1 || v === "true" || v === "1";
};

const acharInfo = (info, arquivo) => {
  const nome = path.basename(arquivo);
  const semExt = path.basename(arquivo, path.extname(arquivo));
  const bruto = info[nome] !== undefined ? info[nome] : info[semExt];
  if (bruto === undefined) return {};
  if (typeof bruto === "string") return { phrase: bruto };
  return (bruto && typeof bruto === "object") ? bruto : {};
};

/* O ARQUIVO DA FERRAMENTA: mix-info.json, na raiz.
   Quem escreve e o organizador.html. Ele NAO mexe no images.json de
   proposito - esse e do robo, e dois donos no mesmo arquivo virariam
   briga toda vez que ela subisse uma foto.
   Chave aqui e o caminho INTEIRO ("Photography/foto.jpg"), porque a
   ferramenta conhece o caminho e nao precisa digitar nada. */
let ferramenta = { tags: [], tagsVisiveis: 2, items: {} };
const caminhoFerr = path.join(RAIZ, "mix-info.json");
if (fs.existsSync(caminhoFerr)) {
  try {
    const lido = JSON.parse(fs.readFileSync(caminhoFerr, "utf8"));
    if (lido && typeof lido === "object") {
      ferramenta = {
        tags: Array.isArray(lido.tags) ? lido.tags : [],
        tagsVisiveis: lido.tagsVisiveis === undefined ? 2 : lido.tagsVisiveis,
        items: (lido.items && typeof lido.items === "object") ? lido.items : {},
      };
    }
  } catch (e) {
    console.error("mix-info.json invalido, seguindo sem ele:", e.message);
  }
}

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
    /* TRES fontes, da mais fraca para a mais forte:
         1. o nome do arquivo e a pasta   (nada a digitar)
         2. o _info.json da pasta         (edicao a mao)
         3. o mix-info.json da ferramenta (o organizador)
       A ferramenta vence porque e o ultimo lugar onde ela mexeu de
       forma deliberada, item por item, olhando a foto. */
    const dPasta = acharInfo(info || {}, a);
    const dFerr = ferramenta.items[a.split(path.sep).join("/")] || {};
    const d = Object.assign({}, dPasta, dFerr);
    /* SEGUIDORA DE CARROSSEL nao vira card: ela e uma PAGINA de outro
       card. Sair aqui e o que faz N fotos virarem 1 item no JSON - sem
       isto o agrupamento nao tiraria nada da grade, so acrescentaria
       uma lista repetida. */
    if (d.carrosselDe) continue;
    /* o nome sai do ARQUIVO por padrao: renomear a foto ja resolve o
       titulo, sem abrir arquivo nenhum. O `_info.json` so entra quando
       ela quiser um nome diferente do nome do arquivo. */
    const item = { name: String(d.name || d.nome || titulo(a)) };
    const frase = d.phrase || d.frase || d.description;
    if (frase) item.phrase = String(frase);
    /* ANO. Vai como TEXTO, nao como numero: "2024" e "2024-2025" tem
       que caber os dois, e um ano nunca entra em conta nenhuma.
       A string vazia e testada separado: e o que a ferramenta grava
       quando ela APAGA o ano, e "vazio de proposito" tem que sair do
       JSON em vez de virar um ano em branco no card. */
    const ano = d.year !== undefined ? d.year : d.ano;
    if (ano !== undefined && ano !== null && String(ano).trim()) {
      item.year = String(ano).trim();
    }
    /* ARQUIVADA. So sai no JSON quando e verdadeira - "nao arquivada"
       e a ausencia da chave, e nao `false`. Assim desarquivar limpa de
       verdade em vez de deixar sujeira no arquivo.
       Aceita texto tambem: um `_info.json` escrito na mao pode trazer
       "true" em vez do booleano. */
    const arq = d.archived !== undefined ? d.archived : d.arquivado;
    if (arq === true || arq === 1 || arq === "true" || arq === "1") {
      item.archived = true;
    }
    /* O INTERRUPTOR DA INFO. Mesma convencao de `archived`: so sai no
       JSON quando esta DESLIGADO, porque ligado e o padrao. Duas razoes
       diferentes levam ao mesmo resultado na tela - a foto sem texto e a
       foto com texto que ela preferiu nao mostrar - e so a segunda
       precisa ser dita no arquivo. */
    if (semInfo(d)) item.noInfo = true;
    Object.assign(item, traducoes(d));
    /* AS PAGINAS do carrossel, na ordem que ela montou - COM A CAPA
       DENTRO, na frente.
       Sao TRES coisas diferentes, e antes eu tinha juntado duas:
         1. a info do GRUPO   -> aparece no card da grade, com a tag e o icone
         2. a info da CAPA    -> aparece na 1a pagina do carrossel
         3. a info de cada foto -> aparece na pagina dela
       A capa e uma foto como as outras: ela tem o texto DELA. O que o
       card mostra e a info do grupo, que mora numa chave separada da
       lider (`grupo`). Enquanto essa chave estiver vazia, o card herda o
       texto da capa - que e exatamente como estava antes, entao nada
       muda de aparencia sozinho. */
    if (Array.isArray(d.carrossel) && d.carrossel.length) {
      const infoDe = (fonte, alvoSrc) => {
        const pg = { src: alvoSrc };
        const nome = fonte.name || fonte.nome;
        const frase = fonte.phrase || fonte.frase || fonte.description;
        if (nome) pg.name = String(nome);
        if (frase) pg.phrase = String(frase);
        /* ANO E LINK POR FOTO. Ausente herda o do grupo na hora de
           mostrar - ano e link sao dados do TRABALHO, e um carrossel
           costuma ser um trabalho so. O texto, nao: texto vazio fica
           vazio, senao as paginas voltariam a repetir a mesma frase. */
        const ano = fonte.year !== undefined ? fonte.year : fonte.ano;
        if (ano !== undefined && ano !== null && String(ano).trim()) {
          pg.year = String(ano).trim();
        }
        if (fonte.link) pg.link = String(fonte.link);
        if (semInfo(fonte)) pg.noInfo = true;
        Object.assign(pg, traducoes(fonte));
        return pg;
      };
      /* a capa entra so quando ela e imagem: card de video usa o proprio
         video como capa, e ai nao ha foto para virar pagina */
      const paginas = (ehVid ? [] : [infoDe(d, url(a))])
        .concat(d.carrossel.map((c) => {
          const chave = String(c);
          return infoDe(ferramenta.items[chave] || {}, url(chave));
        }))
        .filter((x) => x.src);
      if (paginas.length) item.images = paginas;


    }
    if (d.link) item.link = String(d.link);
    /* DEPOIS do link, de proposito: a linha acima grava o link da FOTO
       da capa, e num carrossel quem manda no card e o GRUPO. Posto
       antes, o link do grupo era desfeito na linha seguinte.
       Sai tambem cru em `grupo` para a ferramenta ler de volta o que ela
       escreveu: sem isso, abrir o organizador noutro navegador mostraria
       os campos do grupo em branco enquanto o site mostra o texto -
       campo que so funciona uma vez. */
    if (Array.isArray(d.carrossel) && d.carrossel.length) {
      const g = (d.grupo && typeof d.grupo === "object") ? d.grupo : {};
      const cru = {};
      const gNome = g.name || g.nome;
      const gFrase = g.phrase || g.frase || g.description;
      const gAno = g.year !== undefined ? g.year : g.ano;
      if (gNome) cru.name = String(gNome);
      if (gFrase) cru.phrase = String(gFrase);
      if (gAno !== undefined && gAno !== null && String(gAno).trim()) {
        cru.year = String(gAno).trim();
      }
      if (g.link) cru.link = String(g.link);
      /* o interruptor do GRUPO manda no card, e o da capa fica para a
         primeira pagina - sao dois botoes em lugares diferentes */
      if (semInfo(g)) cru.noInfo = true; else delete item.noInfo;
      /* as traducoes do GRUPO tambem vencem no card; sem esta linha o
         card mostraria o ingles do grupo e o portugues da capa */
      const trG = traducoes(g);
      for (const lg of IDIOMAS) {
        if (trG[lg]) cru[lg] = trG[lg]; else delete item[lg];
      }
      /* o que estiver escrito no grupo VENCE no card; o que estiver
         vazio deixa passar o da capa, que e como o card sempre foi */
      Object.keys(cru).forEach((k) => { item[k] = cru[k]; });
      if (Object.keys(cru).length) item.grupo = cru;
    }
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

/* ORDEM DAS TAGS.
   O componente mostra as primeiras na barra e esconde o resto atras do
   "+". Sem uma ordem declarada, ela sairia da ordem em que as fotos
   aparecem - ou seja, mudaria sozinha ao subir uma foto nova.
   As tags que existem de verdade, na ordem que ela definiu; as que
   sobrarem entram no fim. */
const usadas = [...new Set(itens.map((i) => i.tag).filter(Boolean))];
const tags = ferramenta.tags.filter((t) => usadas.includes(t));
for (const t of usadas) if (!tags.includes(t)) tags.push(t);

const saida = { tags, tagsVisiveis: ferramenta.tagsVisiveis, collections: colecoes, items: itens };
fs.writeFileSync(path.join(RAIZ, "images.json"), JSON.stringify(saida, null, 2) + "\n");

console.log("images.json: " + itens.length + " itens em " + colecoes.length + " colecoes");
console.log("  tags (" + tags.length + "): " + (tags.join(", ") || "nenhuma")
  + "   -> " + ferramenta.tagsVisiveis + " a vista");
for (const c of colecoes) {
  console.log("  - " + c.name + ": " + itens.filter((i) => i.collection === c.name).length);
}
