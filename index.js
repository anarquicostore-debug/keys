const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')

const MY_NUMBER = '556692319913@s.whatsapp.net'
const PHONE_NUMBER = '556692319913'
const KEYWORD = 'Hm'
const AUTH_FOLDER = './auth_info'

let codeShown = false

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
            if (msg.key.fromMe) continue

            const chatId = msg.key.remoteJid
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

            if (text.trim() === KEYWORD && quotedMsg) {
                const viewOnceImage =
                    quotedMsg?.viewOnceMessage?.message?.imageMessage ||
                    quotedMsg?.viewOnceMessageV2?.message?.imageMessage ||
                    quotedMsg?.viewOnceMessageV2Extension?.message?.imageMessage

                if (viewOnceImage) {
                    console.log('🔍 Visualização única detectada, extraindo foto...')
                    try {
                        const quotedKey = msg.message.extendedTextMessage.contextInfo
                        const fakeMsg = {
                            key: {
                                remoteJid: chatId,
                                id: quotedKey.stanzaId,
                                participant: quotedKey.participant,
                            },
                            message: quotedMsg?.viewOnceMessage?.message ||
                                quotedMsg?.viewOnceMessageV2?.message ||
                                quotedMsg?.viewOnceMessageV2Extension?.message,
                        }

                        const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, {
                            logger: undefined,
                            reuploadRequest: sock.updateMediaMessage,
                        })

                        await sock.sendMessage(MY_NUMBER, {
                            image: buffer,
                            caption: '📸 Foto de visualização única extraída!',
                        })

                        console.log('✅ Foto enviada!')
                    } catch (err) {
                        console.error('Erro ao extrair foto:', err.message)
                    }
                }
            }
        }
    })
}

startBot()
