const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')

const MY_NUMBER = '556692319913@s.whatsapp.net'
const PHONE_NUMBER = '556692319913'
const KEYWORD = 'Hm'
const AUTH_FOLDER = './auth_info'

let codeShown = false
const viewOnceStore = new Map()

function extractViewOnce(message) {
    if (!message) return null
    const inner =
        message?.viewOnceMessage?.message ||
        message?.viewOnceMessageV2?.message ||
        message?.viewOnceMessageV2Extension?.message ||
        message
    const media = inner?.imageMessage || inner?.videoMessage
    if (media && (media.viewOnce || message?.viewOnceMessage || message?.viewOnceMessageV2 || message?.viewOnceMessageV2Extension)) {
        return { innerMessage: inner, isVideo: !!inner?.videoMessage }
    }
    return null
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)
    const { version } = await fetchLatestBaileysVersion()
    console.log('📦 Versão WhatsApp Web:', version.join('.'))

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
    })

    if (!sock.authState.creds.registered && !codeShown) {
        codeShown = true
        await new Promise(r => setTimeout(r, 4000))
        try {
            const code = await sock.requestPairingCode(PHONE_NUMBER)
            const formatted = code?.match(/.{1,4}/g)?.join('-') || code
            console.log('\n==============================')
            console.log('🔑 SEU CÓDIGO: ' + formatted)
            console.log('==============================\n')
            console.log('👉 WhatsApp → Aparelhos conectados → Conectar com número → digite o código')
            console.log('⏳ Digite RÁPIDO (expira em ~1 min). Não feche o terminal.\n')
        } catch (err) {
            console.error('Erro ao solicitar código:', err.message)
            codeShown = false
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!')
            await sock.sendMessage(MY_NUMBER, { text: 'Conectado !' })
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Deslogado. Delete auth_info e rode novamente.')
                return
            }
            console.log('🔄 Reconectando...')
            await new Promise(r => setTimeout(r, 2000))
            startBot()
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message) continue

            const chatId = msg.key.remoteJid

            // 1) Guarda qualquer view-once que chega (antes de ser aberta)
            const incoming = extractViewOnce(msg.message)
            if (incoming && msg.key.id) {
                viewOnceStore.set(msg.key.id, {
                    key: msg.key,
                    innerMessage: incoming.innerMessage,
                    isVideo: incoming.isVideo,
                })
                console.log('💾 View-once guardada:', msg.key.id)
            }

            const ctx = msg.message?.extendedTextMessage?.contextInfo
            const quotedMsg = ctx?.quotedMessage
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

            if (text.trim()) console.log('💬 Mensagem:', JSON.stringify(text.trim()), 'fromMe:', msg.key.fromMe, 'temQuote:', !!ctx?.stanzaId)

            if (text.trim().toLowerCase() === KEYWORD.toLowerCase() && ctx?.stanzaId) {
                console.log('🔑 Palavra-chave recebida, procurando view-once...')

                let target = viewOnceStore.get(ctx.stanzaId)

                // fallback: tenta extrair da própria mensagem citada
                if (!target) {
                    const fromQuoted = extractViewOnce(quotedMsg)
                    if (fromQuoted) {
                        target = {
                            key: {
                                remoteJid: chatId,
                                id: ctx.stanzaId,
                                participant: ctx.participant,
                                fromMe: false,
                            },
                            innerMessage: fromQuoted.innerMessage,
                            isVideo: fromQuoted.isVideo,
                        }
                    }
                }

                if (!target) {
                    console.log('⚠️  View-once não encontrada (talvez já expirou ou não foi capturada).')
                    continue
                }

                try {
                    const fakeMsg = { key: target.key, message: target.innerMessage }
                    const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, {
                        logger: undefined,
                        reuploadRequest: sock.updateMediaMessage,
                    })

                    if (target.isVideo) {
                        await sock.sendMessage(MY_NUMBER, {
                            video: buffer,
                            caption: '📸 Vídeo de visualização única extraído!',
                        })
                    } else {
                        await sock.sendMessage(MY_NUMBER, {
                            image: buffer,
                            caption: '📸 Foto de visualização única extraída!',
                        })
                    }

                    console.log('✅ Mídia enviada!')
                    viewOnceStore.delete(ctx.stanzaId)
                } catch (err) {
                    console.error('Erro ao extrair mídia:', err.message)
                }
            }
        }
    })
}

startBot()
