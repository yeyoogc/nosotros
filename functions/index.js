/**
 * Cloud Functions para Nosotros PWA - Notificaciones Push
 * 
 * Envía notificaciones push via FCM cuando:
 * 1. La pareja cambia su estado (/status/{user})
 * 2. La pareja añade un sentimiento (/sentimientos)
 * 3. La pareja envía "Te echo de menos" (/missyou/{user})
 * 4. La pareja deja una nota de amor (/notas)
 */

const { onValueWritten, onValueCreated } = require('firebase-functions/v2/database');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const logger = require('firebase-functions/logger');

initializeApp();

// Deploy functions in europe-west1 (same region as the database)
setGlobalOptions({ region: 'europe-west1' });

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all FCM tokens for a user from /fcmTokens/{user}
 */
async function getTokensForUser(user) {
    const snap = await getDatabase().ref('fcmTokens/' + user).once('value');
    const data = snap.val();
    if (!data) return [];
    return Object.values(data).filter(t => typeof t === 'string' && t.length > 0);
}

/**
 * Send push notification to a list of tokens and clean up invalid ones
 */
async function sendPush(targetUser, tokens, title, body, dataPayload = {}) {
    if (!tokens || tokens.length === 0) {
        logger.info(`No tokens for ${targetUser}, skipping push`);
        return;
    }

    logger.info(`Sending push to ${targetUser} (${tokens.length} tokens): ${title}`);

    const invalidTokens = [];

    const results = await Promise.allSettled(
        tokens.map(token => {
            return getMessaging().send({
                token,
                data: {
                    title: String(title),
                    body: String(body),
                    type: String(dataPayload.type || 'general'),
                    url: 'https://yeyoogc.github.io/nosotros/'
                },
                webpush: {
                    headers: { Urgency: 'high' },
                    fcmOptions: {
                        link: 'https://yeyoogc.github.io/nosotros/'
                    }
                }
            });
        })
    );

    // Check for invalid tokens to clean up
    for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
            const err = results[i].reason;
            logger.warn('Push failed:', err.code, err.message);
            if (
                err.code === 'messaging/registration-token-not-registered' ||
                err.code === 'messaging/invalid-registration-token'
            ) {
                invalidTokens.push(tokens[i]);
            }
        } else {
            logger.info('Push sent successfully to token', i);
        }
    }

    // Remove invalid tokens from database
    if (invalidTokens.length > 0) {
        const snap = await getDatabase().ref('fcmTokens/' + targetUser).once('value');
        const data = snap.val();
        if (data) {
            const updates = {};
            for (const [key, val] of Object.entries(data)) {
                if (invalidTokens.includes(val)) {
                    updates[key] = null;
                }
            }
            if (Object.keys(updates).length > 0) {
                await getDatabase().ref('fcmTokens/' + targetUser).update(updates);
                logger.info(`Removed ${Object.keys(updates).length} invalid tokens for ${targetUser}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 1. CAMBIO DE ESTADO - /status/{user}
// ═══════════════════════════════════════════════════════════════

exports.onStatusChange = onValueWritten(
    {
        ref: '/status/{user}',
        instance: 'nosotrosapp-1377b-default-rtdb',
        region: 'europe-west1'
    },
    async (event) => {
        const user = event.params.user;
        const partner = user === 'sergio' ? 'alba' : 'sergio';
        const data = event.data.after.val();

        if (!data || !data.text) return;

        const name = user.charAt(0).toUpperCase() + user.slice(1);
        const tokens = await getTokensForUser(partner);

        await sendPush(
            partner,
            tokens,
            `${name} cambió su estado`,
            `${data.emoji || '💫'} ${data.text}`,
            { type: 'status' }
        );
    }
);

// ═══════════════════════════════════════════════════════════════
// 2. NUEVO SENTIMIENTO - /sentimientos/{sentId}
// ═══════════════════════════════════════════════════════════════

exports.onNewSentimiento = onValueCreated(
    {
        ref: '/sentimientos/{sentId}',
        instance: 'nosotrosapp-1377b-default-rtdb',
        region: 'europe-west1'
    },
    async (event) => {
        const data = event.data.val();
        if (!data || !data.author) return;

        const partner = data.author === 'sergio' ? 'alba' : 'sergio';
        const name = data.author.charAt(0).toUpperCase() + data.author.slice(1);
        const tokens = await getTokensForUser(partner);

        await sendPush(
            partner,
            tokens,
            `${name} añadió un sentimiento`,
            `${data.emoji || '🫶'} "${(data.text || 'Nuevo sentimiento').substring(0, 60)}"`,
            { type: 'sentimiento' }
        );
    }
);

// ═══════════════════════════════════════════════════════════════
// 3. TE ECHO DE MENOS - /missyou/{targetUser}
// ═══════════════════════════════════════════════════════════════

exports.onMissYou = onValueWritten(
    {
        ref: '/missyou/{targetUser}',
        instance: 'nosotrosapp-1377b-default-rtdb',
        region: 'europe-west1'
    },
    async (event) => {
        const targetUser = event.params.targetUser;
        const data = event.data.after.val();

        if (!data || !data.from) return;

        const name = data.from.charAt(0).toUpperCase() + data.from.slice(1);
        const tokens = await getTokensForUser(targetUser);

        await sendPush(
            targetUser,
            tokens,
            `${name} te echa de menos 💕`,
            'Está pensando en ti ahora mismo',
            { type: 'missyou' }
        );
    }
);

// ═══════════════════════════════════════════════════════════════
// 4. NUEVA NOTA DE AMOR - /notas/{noteId}
// ═══════════════════════════════════════════════════════════════

exports.onNewNote = onValueCreated(
    {
        ref: '/notas/{noteId}',
        instance: 'nosotrosapp-1377b-default-rtdb',
        region: 'europe-west1'
    },
    async (event) => {
        const data = event.data.val();
        if (!data || !data.author) return;

        const partner = data.author === 'sergio' ? 'alba' : 'sergio';
        const name = data.author.charAt(0).toUpperCase() + data.author.slice(1);
        const tokens = await getTokensForUser(partner);

        await sendPush(
            partner,
            tokens,
            `${name} te dejó una nota de amor 💌`,
            (data.text || 'Nueva nota').substring(0, 80),
            { type: 'nota' }
        );
    }
);
