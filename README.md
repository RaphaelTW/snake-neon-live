# Snake Neon Live — Web + Mobile (Netlify)

Jogo Snake em **HTML, CSS e JavaScript puro**. Funciona em navegadores de computador e de celular (Android/iPhone). Não exige Node.js, NPM, banco de dados ou instalação de bibliotecas.

## Publicar no Netlify

### Opção A — arrastar e soltar (mais rápida)

1. Extraia este arquivo ZIP.
2. Abra https://app.netlify.com/drop e entre na sua conta Netlify.
3. Arraste **a pasta `Snake_Neon_Live_Netlify_Mobile` extraída**, que contém `index.html` na raiz, para a área de publicação.
4. O Netlify publicará um endereço HTTPS para abrir o jogo no celular ou computador.

**Atenção:** se usar upload manual pelo navegador, envie a **pasta extraída**, não o ZIP fechado. O `index.html` está na raiz, como o Netlify precisa.

### Opção B — GitHub conectado ao Netlify

1. Crie um repositório e coloque estes arquivos **na raiz**.
2. No Netlify, importe o projeto pelo GitHub.
3. Build command: **deixe vazio**. Publish directory: **`.`** (raiz do projeto), conforme `netlify.toml`.
4. Faça deploy. Não é preciso instalar dependências.

## Controles

| Plataforma | Movimento | Iniciar / retomar | Pausar |
| --- | --- | --- | --- |
| **PC com teclado** | Setas ou WASD | Botão na tela | Espaço ou P |
| **Celular (touch)** | Deslizar no tabuleiro ou tocar nas quatro setas virtuais | Botão na tela | Botão Pausar |
| **Controle no PC (USB/Bluetooth)** | Direcional digital ou analógico esquerdo | Botão A | START / Menu |
| **Controle no celular (Bluetooth)** | Direcional digital ou analógico esquerdo | Botão A | START / Menu |

- No teclado: **R** reinicia e **M** liga/desliga o som.
- O jogo mostra na tela se encontrou um controle conectado.
- Ao trocar de aba para configurar o Bluetooth, ou quando um controle desconecta, a partida é pausada automaticamente.

### Como conectar um controle

1. No **Windows ou Linux**, conecte o gamepad por USB ou faça o pareamento Bluetooth nas configurações do sistema.
2. No **Android ou iPhone**, abra as configurações Bluetooth, coloque o controle em modo de pareamento e conecte-o.
3. Abra o jogo no navegador. Pressione um botão do controle para o navegador reconhecê-lo.
4. Confira o indicador **🎮 CONECTADO** abaixo do tabuleiro.

O suporte depende da **Gamepad API** do navegador e do mapeamento do controle. Use um navegador atualizado em HTTPS (o Netlify fornece HTTPS). Alguns navegadores móveis, especialmente navegadores embutidos em aplicativos, podem não disponibilizar controles; nesses casos, as setas touch continuam funcionando.
Se o controle iniciar uma partida mas o navegador bloquear o áudio, toque na tela ou no botão de som uma vez para liberar os efeitos sonoros.

- **Objetivo:** comer 20 frutas para vencer. A cobra cresce e o nível fica mais rápido.
- **Áudio:** os cinco sons arcade (movimento, fruta, morte, vitória e game over) são sintetizados pelo navegador. O som é ativado a partir da interação do jogador, respeitando as restrições de áudio do iOS/Android.

## Ranking

O Top 8 guarda o apelido e a pontuação no `localStorage` de cada navegador. **Não é um ranking global compartilhado:** um visitante no celular não verá automaticamente os pontos salvos por outro visitante ou navegador. Um ranking online precisa de API e banco de dados.

## Arquivos

```text
Snake_Neon_Live_Netlify_Mobile/
├── index.html     # entrada do jogo, diretamente na raiz
├── styles.css     # tema neon e layout responsivo
├── game.js        # motor do Snake, som e ranking
├── favicon.svg    # ícone do site
├── netlify.toml   # publicação estática no Netlify
└── README.md      # instruções
```

O projeto também pode rodar sem internet: basta abrir `index.html` localmente. A publicação no Netlify deve ser realizada por você na sua própria conta; este pacote não realiza nenhum deploy automaticamente.
