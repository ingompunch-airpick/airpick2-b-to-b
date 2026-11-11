import { defineString } from 'firebase-functions/params';

export const alimtalkEnabled = defineString('ALIMTALK_ENABLED', { default: 'false' });
export const alimtalkProvider = defineString('ALIMTALK_PROVIDER', { default: 'nhn' });
export const nhnAppKey = defineString('NHN_ALIMTALK_APP_KEY', { default: '' });
export const nhnSecretKey = defineString('NHN_ALIMTALK_SECRET_KEY', { default: '' });
export const nhnSenderKey = defineString('NHN_ALIMTALK_SENDER_KEY', { default: '' });
export const ncpAccessKey = defineString('NCP_ALIMTALK_ACCESS_KEY', { default: '' });
export const ncpSecretKey = defineString('NCP_ALIMTALK_SECRET_KEY', { default: '' });
export const ncpServiceId = defineString('NCP_ALIMTALK_SERVICE_ID', { default: '' });
export const ncpPlusFriendId = defineString('NCP_ALIMTALK_PLUS_FRIEND_ID', {
  default: '@airpickup',
});
export const ncpTemplateReserve = defineString('NCP_ALIMTALK_TEMPLATE_RESERVE', {
  default: 'reservation3',
});
export const ncpTemplateRemind = defineString('NCP_ALIMTALK_TEMPLATE_REMIND', {
  default: 'remind',
});
export const ncpTemplateCheckin = defineString('NCP_ALIMTALK_TEMPLATE_CHECKIN', { default: '' });
export const ncpTemplateCheckout = defineString('NCP_ALIMTALK_TEMPLATE_CHECKOUT', {
  default: 'checkout1',
});

/** onReservationSync · remind 스케줄러가 같은 env 를 쓰도록 */
export function applyAlimtalkRuntimeEnv(): void {
  process.env.ALIMTALK_ENABLED = alimtalkEnabled.value();
  process.env.ALIMTALK_PROVIDER = alimtalkProvider.value();
  process.env.NHN_ALIMTALK_APP_KEY = nhnAppKey.value();
  process.env.NHN_ALIMTALK_SECRET_KEY = nhnSecretKey.value();
  process.env.NHN_ALIMTALK_SENDER_KEY = nhnSenderKey.value();
  process.env.NCP_ALIMTALK_ACCESS_KEY = ncpAccessKey.value();
  process.env.NCP_ALIMTALK_SECRET_KEY = ncpSecretKey.value();
  process.env.NCP_ALIMTALK_SERVICE_ID = ncpServiceId.value();
  process.env.NCP_ALIMTALK_PLUS_FRIEND_ID = ncpPlusFriendId.value();
  process.env.NCP_ALIMTALK_TEMPLATE_RESERVE = ncpTemplateReserve.value();
  process.env.NCP_ALIMTALK_TEMPLATE_REMIND = ncpTemplateRemind.value();
  process.env.NCP_ALIMTALK_TEMPLATE_CHECKIN = ncpTemplateCheckin.value();
  process.env.NCP_ALIMTALK_TEMPLATE_CHECKOUT = ncpTemplateCheckout.value();
}
