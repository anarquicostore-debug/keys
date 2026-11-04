const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs')
const path = require('path')

const MY_NUMBER = '556692319913@s.whatsapp.net'
const PHONE_NUMBER = '556692319913'
const KEYWORD = 'Hm'
const AUTH_FOLDER = './auth_info'

let pairingCodeRequested = false

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    })

    if (!sock.authState.creds.registered && !pairingCodeRequested) {
        pairingCodeRequested = true
        await new Promise(r => setTimeout(r, 2000))
        try {
            const code = await sock.requestPairingCode(PHONE_NUMBER)
            console.log('\n🔑 SEU CÓDIGO: ' + code + '\n')
            console.log('👉 WhatsApp → Aparelhos conectados → Conectar com número → Digite o código\n')
            console.log('⏳ Aguardando você digitar o código no WhatsApp...\n')
        } catch (err) {
            console.error('Erro ao solicitar código:', err.message)
            pairingCodeRequested = false
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!')
            await sock.sendMessage(MY_NUMBER, { text: 'Conectado !' })
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            const loggedOut = code === DisconnectReason.loggedOut
            if (!loggedOut) {
                console.log('🔄 Reconectando...')
                startBot()
            } else {
                console.log('❌ Deslogado. Delete a pasta auth_info e rode novamente.')
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
