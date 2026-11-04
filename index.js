const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')

const MY_NUMBER = '556692319913@s.whatsapp.net'
const KEYWORD = 'Hm'
const AUTH_FOLDER = './auth_info'

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    })

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!')
            await sock.sendMessage(MY_NUMBER, { text: 'Conectado !' })
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect)
            if (shouldReconnect) {
                startBot()
            }
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

                        const fileName = `view_once_${Date.now()}.jpg`
                        const filePath = path.join(__dirname, fileName)
                        fs.writeFileSync(filePath, buffer)

                        await sock.sendMessage(MY_NUMBER, {
                            image: buffer,
                            caption: '📸 Foto de visualização única extraída!',
                        })

                        console.log(`✅ Foto enviada para ${MY_NUMBER}`)
                        fs.unlinkSync(filePath)
                    } catch (err) {
                        console.error('Erro ao extrair foto:', err)
                    }
                } else {
                    console.log('⚠️  Mensagem citada não contém imagem de visualização única.')
                }
            }
        }
    })
}

startBot()
