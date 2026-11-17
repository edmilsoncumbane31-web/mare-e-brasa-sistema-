import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fqmwhuxtnmkigqzxvvdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Y9G1dFENVRTQCpJXgoo8BQ_D6KUlhJY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const restauranteEl = document.getElementById("restaurante");
const categoriasEl = document.getElementById("categorias");
const produtosEl = document.getElementById("produtos");

let todosProdutos = [];
let categoriaAtiva = "todos";

function criarTexto(tag, texto) {
    const elemento = document.createElement(tag);
    elemento.textContent = texto || "";
    return elemento;
}

async function carregarRestaurante() {
    const { data, error } = await supabase
        .from("restaurantes")
        .select("*")
        .limit(1)
        .maybeSingle();

    if (error) {
        restauranteEl.textContent = "Erro ao carregar o restaurante.";
        console.error(error);
        return;
    }

    if (!data) {
        restauranteEl.textContent = "Restaurante não encontrado.";
        return;
    }

    restauranteEl.replaceChildren(
        criarTexto("h2", data.nome),
        criarTexto("p", data.morada || "Maputo, Moçambique")
    );
}

async function carregarCategorias() {
    const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .order("nome");

    if (error) {
        console.error("Erro nas categorias:", error);
        return;
    }

    categoriasEl.replaceChildren();

    const todas = criarBotaoCategoria("Todos", "todos");
    categoriasEl.appendChild(todas);

    (data || []).forEach(categoria => {
        categoriasEl.appendChild(
            criarBotaoCategoria(categoria.nome, categoria.id)
        );
    });
}

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

async function carregarProdutos() {
    const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .order("nome");

    if (error) {
        produtosEl.textContent = "Erro ao carregar os produtos.";
        console.error(error);
        return;
    }

    todosProdutos = data || [];
    mostrarProdutos();
}

function mostrarProdutos() {
    produtosEl.replaceChildren();

    const filtrados = todosProdutos.filter(produto => {
        const disponivel = produto.disponivel !== false;
        const categoriaCorreta =
            categoriaAtiva === "todos" ||
            String(produto.categoria_id) === categoriaAtiva;

        return disponivel && categoriaCorreta;
    });

    if (filtrados.length === 0) {
        produtosEl.textContent = "Ainda não existem produtos disponíveis.";
        return;
    }

    filtrados.forEach(produto => {
        const cartao = document.createElement("article");
        cartao.className = "produto";

        const imagem = document.createElement("img");
        imagem.alt = produto.nome || "Produto";
        imagem.loading = "lazy";

        if (produto.imagem_url) {
            imagem.src = produto.imagem_url;
        }

        const conteudo = document.createElement("div");
        conteudo.className = "produto-conteudo";

        const nome = criarTexto("h3", produto.nome);
        const descricao = criarTexto("p", produto.descricao);
        const preco = criarTexto("p", `${produto.preco ?? 0} MT`);

        preco.className = "preco";

        conteudo.append(nome, descricao, preco);
        cartao.append(imagem, conteudo);
        produtosEl.appendChild(cartao);
    });
}

async function iniciar() {
    await carregarRestaurante();
    await carregarCategorias();
    await carregarProdutos();
}

iniciar();
