// config/tencentSmsConfig.js
module.exports = {
  // 腾讯云API密钥（从控制台获取）
  secretId: process.env.TENCENT_SECRET_ID || '你的SecretId',
  secretKey: process.env.TENCENT_SECRET_KEY || '你的SecretKey',
  
  // API端点（你提供的）
  endpoint: 'sms.tencentcloudapi.com',
  region: 'ap-nanjing',
  version: '2021-01-11',
  action: 'SendSms',
  
  // 短信应用配置（控制台获取）
  smsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID || '你的应用ID',
  smsSdkAppId: process.env.TENCENT_SMS_SDK_APP_KEY || '你的应用Key',
  templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '你的模板ID', 
  signName: process.env.TENCENT_SMS_SIGN_NAME || '你的签名名称',
  
  // 业务配置
  codeExpiration: 5, // 验证码有效期（分钟）
  
  // 签名方法
  algorithm: 'TC3-HMAC-SHA256',
  service: 'sms'
};