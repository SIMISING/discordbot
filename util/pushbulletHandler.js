const Pushbullet = require('pushbullet').default || require('pushbullet');
require('dotenv').config();

const PUSHBULLET_API_KEY = process.env.PUSHBULLET_API_KEY;
const PAYMENT_TIMEOUT_MS = 5 * 60 * 1000; // 5분
const MAX_RECONNECT_ATTEMPTS = 5;

function promiseTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function disconnectStream(stream) {
  try {
    if (stream && typeof stream.disconnect === 'function') {
      stream.disconnect();
    }
  } catch (error) {
    console.warn('[pushbullet] 스트림 disconnect 실패 : ', error);
  }

  try {
    if (stream && typeof stream.stop === 'function') {
      stream.stop();
    }
  } catch (error) {
    console.warn('[pushbullet] 스트림 stop 실패 : ', error);
  }
}

function verifyPayment(sender, amount) {
  if (!PUSHBULLET_API_KEY) {
    throw new Error('`.env`에 PUSHBULLET_API_KEY가 설정되어 있지 않습니다.');
  }

  const pusher = new Pushbullet(PUSHBULLET_API_KEY);
  const stream = pusher.stream();
  let finished = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  const cleanup = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    disconnectStream(stream);
  };

  const scheduleReconnect = () => {
    if (finished) {
      return false;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return false;
    }

    const delay = Math.min(1000 * (2 ** reconnectAttempts), 15000);
    reconnectAttempts += 1;
    console.warn(`[pushbullet] 스트림이 끊어져 재연결을 시도합니다. (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, ${delay}ms)`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      try {
        stream.connect();
      } catch (error) {
        if (!finished) {
          finished = true;
          cleanup();
          reject(new Error(`Pushbullet 연결 실패 : ${error.message || error}`));
        }
      }
    }, delay);

    return true;
  };

  const paymentPromise = new Promise((resolve, reject) => {
    stream.on('connect', () => {
      reconnectAttempts = 0;
      console.log('[pushbullet] 스트림 연결됨.');
    });

    stream.on('error', error => {
      if (finished) return;
      console.warn('[pushbullet] 스트림 오류 발생 : ', error);
      if (!scheduleReconnect()) {
        finished = true;
        cleanup();
        reject(new Error(`Pushbullet 스트림 오류 : ${error.message || error}`));
      }
    });

    stream.on('close', () => {
      if (finished) return;
      console.warn('[pushbullet] 스트림이 종료되어 재연결을 시도합니다.');
      if (!scheduleReconnect()) {
        finished = true;
        cleanup();
        reject(new Error('Pushbullet 스트림이 종료되었습니다.'));
      }
    });

    stream.on('push', pushEvent => {
      if (finished) return;

      const pushData = pushEvent && pushEvent.push ? pushEvent.push : pushEvent;
      const title = String(pushData.title || '').trim();
      const body = String(pushData.body || '').trim();
      const combinedMessage = `${title} ${body}`.replace(/\s+/g, ' ').trim();

      console.log(`[pushbullet] 새 푸시 알림 : ${combinedMessage}`);

      if (!combinedMessage) {
        return;
      }

      const pureNumbers = combinedMessage.replace(/[^0-9]/g, '');
      const hasPaymentKeyword = /입금|송금/.test(combinedMessage);
      const hasSender = combinedMessage.includes(sender.trim());
      const hasAmount = pureNumbers.includes(amount.toString());

      console.log(`[pushbullet] 결제 확인 - 키워드 : ${hasPaymentKeyword}, 입금자명 : ${hasSender}, 금액 : ${hasAmount}`);
      console.log(`[pushbullet] 입금자명 검색 : "${sender.trim()}", 금액 검색 : "${amount}" in "${pureNumbers}"`);

      if (hasPaymentKeyword && hasSender && hasAmount) {
        finished = true;
        cleanup();
        resolve(combinedMessage);
      }
    });

    try {
      stream.connect();
    } catch (error) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(`Pushbullet 연결 실패 : ${error.message || error}`));
    }
  });

  return promiseTimeout(paymentPromise, PAYMENT_TIMEOUT_MS, '5분 동안 일치하는 입금 알림을 찾지 못했습니다.');
}

module.exports = {
  verifyPayment,
};