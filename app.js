
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// LIGAÇÃO AO SUPABASE
const SUPABASE_URL = "https://fqmwhuxtnmkigqzxvvdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Y9G1dFENVRTQCpJXgoo8BQ_D6KUlhJY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// IDENTIFICADOR DO RESTAURANTE
const RESTAURANTE_SLUG = "mare-e-brasa";

// ELEMENTOS HTML
const restauranteEl = document.getElementById("restaurante");
const categoriasEl = document.getElementById("categorias");
const produtosEl = document.getElementById("produtos");

let restauranteId = null;
let todosProdutos = [];
let categoriaAtiva = "todos";

// CRIAR ELEMENTOS DE TEXTO COM SEGURANÇA
function criarTexto(tag, texto) {
    const elemento = document.createElement(tag);
    elemento.textContent = texto || "";
    return elemento;
}

// FORMATAR PREÇOS EM METICAIS
function formatarPreco(centavos) {
    return (Number(centavos || 0) / 100).toLocaleString("pt-MZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " MT";
}

// CARREGAR DADOS DO RESTAURANTE
async function carregarRestaurante() {
    const { data, error } = await supabase
        .from("restaurantes")
        .select("id, nome, endereco, slug, ativo")
        .eq("slug", RESTAURANTE_SLUG)
        .eq("ativo", true)
        .maybeSingle();

    if (error) {
        restauranteEl.textContent = "Erro ao carregar o restaurante.";
        console.error("Erro no restaurante:", error);
        return false;
    }

    if (!data) {
        restauranteEl.textContent = "Restaurante não encontrado.";
        return false;
    }

    restauranteId = data.id;

    restauranteEl.replaceChildren(
        criarTexto("h2", data.nome),
        criarTexto("p", data.endereco || "Maputo, Moçambique")
    );

    return true;
}

// CARREGAR CATEGORIAS
async function carregarCategorias() {
    const { data, error } = await supabase
        .from("categorias")
        .select("id, nome, ordem")
        .eq("restaurante_id", restauranteId)
        .eq("visivel", true)
        .order("ordem", { ascending: true });

    if (error) {
        categoriasEl.textContent = "Erro ao carregar categorias.";
        console.error("Erro nas categorias:", error);
        return;
    }

    categoriasEl.replaceChildren();

    categoriasEl.appendChild(
        criarBotaoCategoria("Todos", "todos")
    );

    (data || []).forEach(categoria => {
        categoriasEl.appendChild(
            criarBotaoCategoria(categoria.nome, categoria.id)
        );
    });
}

// CRIAR BOTÕES DAS CATEGORIAS
function criarBotaoCategoria(nome, id) {
    const botao = document.createElement("button");

    botao.textContent = nome;
    botao.classList.toggle("ativo", String(id) === "todos");

    botao.addEventListener("click", () => {
        categoriaAtiva = String(id);

        categoriasEl.querySelectorAll("button").forEach(item => {
            item.classList.remove("ativo");
        });

        botao.classList.add("ativo");

        mostrarProdutos();
    });

    return botao;
}

// OBTER URL PÚBLICO DA FOTOGRAFIA
function obterImagem(fotoPath) {
    if (!fotoPath) {
        return null;
    }

    const { data } = supabase.storage
        .from("fotos-pratos")
        .getPublicUrl(fotoPath);

    return data.publicUrl;
}

// CARREGAR PRODUTOS
async function carregarProdutos() {
    produtosEl.textContent = "A carregar produtos...";

    const { data, error } = await supabase
        .from("produtos")
        .select(`
            id,
            categoria_id,
            nome,
            descricao,
            preco_centavos,
            foto_path,
            disponivel,
            destaque,
            ordem
        `)
        .eq("restaurante_id", restauranteId)
        .eq("disponivel", true)
        .eq("arquivado", false)
        .order("ordem", { ascending: true });

    if (error) {
        produtosEl.textContent = "Erro ao carregar produtos.";
        console.error("Erro nos produtos:", error);
        return;
    }

    todosProdutos = data || [];

    mostrarProdutos();
}

// MOSTRAR PRODUTOS NA PÁGINA
function mostrarProdutos() {
    produtosEl.replaceChildren();

    const filtrados = todosProdutos.filter(produto => {
        return categoriaAtiva === "todos" ||
            String(produto.categoria_id) === categoriaAtiva;
    });

    if (filtrados.length === 0) {
        produtosEl.textContent = "Ainda não existem produtos disponíveis nesta categoria.";
        return;
    }

    filtrados.forEach(produto => {
        const cartao = document.createElement("article");
        cartao.className = "produto";

        if (produto.destaque) {
            cartao.classList.add("produto-destaque");
        }

        if (produto.foto_path) {
            const imagem = document.createElement("img");

            imagem.alt = produto.nome || "Fotografia do prato";
            imagem.loading = "lazy";
            imagem.src = obterImagem(produto.foto_path);

            cartao.appendChild(imagem);
        }

        const conteudo = document.createElement("div");
        conteudo.className = "produto-conteudo";

        const nome = criarTexto("h3", produto.nome);
        const descricao = criarTexto("p", produto.descricao);
        const preco = criarTexto(
            "p",
            formatarPreco(produto.preco_centavos)
        );

        preco.className = "preco";

        conteudo.append(nome, descricao, preco);
        cartao.appendChild(conteudo);

        produtosEl.appendChild(cartao);
    });
}

// INICIAR O CARDÁPIO
async function iniciar() {
    restauranteEl.textContent = "A carregar restaurante...";

    const restauranteEncontrado = await carregarRestaurante();

    if (!restauranteEncontrado) {
        return;
    }

    await carregarCategorias();
    await carregarProdutos();
}

iniciar();
