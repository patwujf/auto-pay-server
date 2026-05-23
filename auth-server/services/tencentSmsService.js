// services/tencentSmsService.js
const crypto = require('crypto');
const moment = require('moment');
const fetch = require('node-fetch');
const smsConfig = require('../config/tencentSmsConfig');

class TencentSmsService {
  constructor() {
    console.log('腾讯云短信服务初始化');
  }

  /**
   * 生成腾讯云API签名
   */
  generateSignature(secretKey, date, service, stringToSign) {
    const kDate = crypto.createHmac('SHA256', 'TC3' + secretKey)
      .update(date)
      .digest();
    
    const kService = crypto.createHmac('SHA256', kDate)
      .update(service)
      .digest();
    
    const kSigning = crypto.createHmac('SHA256', kService)
      .update('tc3_request')
      .digest();
    
    return crypto.createHmac('SHA256', kSigning)
      .update(stringToSign)
      .digest('hex');
  }
 async sendVerificationCode2(phoneNumber, code) {
    try {
      const tencentcloud = require("tencentcloud-sdk-nodejs")

      // 导入对应产品模块的client models。
      const smsClient = tencentcloud.sms.v20210111.Client

/* 实例化要请求产品(以sms为例)的client对象 */
const client = new smsClient({
  credential: {
  /* 为了保护密钥安全，建议将密钥设置在环境变量中或者配置文件中。
   * 硬编码密钥到代码中有可能随代码泄露而暴露，有安全隐患，并不推荐。
   * SecretId、SecretKey 查询: https://console.cloud.tencent.com/cam/capi */
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  /* 必填：地域信息，可以直接填写字符串ap-guangzhou，支持的地域列表参考 https://cloud.tencent.com/document/api/382/52071#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8 */
  region: "ap-nanjing",
  /* 非必填:
   * 客户端配置对象，可以指定超时时间等配置 */
  profile: {
    /* SDK默认用TC3-HMAC-SHA256进行签名，非必要请不要修改这个字段 */
    signMethod: "HmacSHA256",
    httpProfile: {
      reqMethod: "POST", // 请求方法
      reqTimeout: 10, // 请求超时时间，默认60s
      /**
       * 指定接入地域域名，默认就近地域接入域名为 sms.tencentcloudapi.com ，也支持指定地域域名访问，例如广州地域的域名为 sms.ap-guangzhou.tencentcloudapi.com
       */
      endpoint: "sms.tencentcloudapi.com"
    },
  },
})

/* 请求参数，根据调用的接口和实际情况，可以进一步设置请求参数
 * 属性可能是基本类型，也可能引用了另一个数据结构
 * 推荐使用IDE进行开发，可以方便的跳转查阅各个接口和数据结构的文档说明 */

/* 帮助链接：
 * 短信控制台: https://console.cloud.tencent.com/smsv2
 * 腾讯云短信小助手: https://cloud.tencent.com/document/product/382/3773#.E6.8A.80.E6.9C.AF.E4.BA.A4.E6.B5.81 */
const params = {
  /* 短信应用ID: 短信SdkAppId在 [短信控制台] 添加应用后生成的实际SdkAppId，示例如1400006666 */
  // 应用 ID 可前往 [短信控制台](https://console.cloud.tencent.com/smsv2/app-manage) 查看
  SmsSdkAppId: "1401086283",
  /* 短信签名内容: 使用 UTF-8 编码，必须填写已审核通过的签名 */
  // 签名信息可前往 [国内短信](https://console.cloud.tencent.com/smsv2/csms-sign) 或 [国际/港澳台短信](https://console.cloud.tencent.com/smsv2/isms-sign) 的签名管理查看
  SignName: "睿剑商务咨询",
  /* 模板 ID: 必须填写已审核通过的模板 ID */
  // 模板 ID 可前往 [国内短信](https://console.cloud.tencent.com/smsv2/csms-template) 或 [国际/港澳台短信](https://console.cloud.tencent.com/smsv2/isms-template) 的正文模板管理查看
  TemplateId: "2599132",
  /* 模板参数: 模板参数的个数需要与 TemplateId 对应模板的变量个数保持一致，若无模板参数，则设置为空 */
  TemplateParamSet: [code],
  /* 下发手机号码，采用 e.164 标准，+[国家或地区码][手机号]
   * 示例如：+8613711112222， 其中前面有一个+号 ，86为国家码，13711112222为手机号，最多不要超过200个手机号*/
  PhoneNumberSet: [`+86${phoneNumber}`],
  /* 用户的 session 内容（无需要可忽略）: 可以携带用户侧 ID 等上下文信息，server 会原样返回 */
  SessionContext: "",
  /* 短信码号扩展号（无需要可忽略）: 默认未开通，如需开通请联系 [腾讯云短信小助手] */
  ExtendCode: "",
  /* 国内短信无需填写该项；国际/港澳台短信已申请独立 SenderId 需要填写该字段，默认使用公共 SenderId，无需填写该字段。注：月度使用量达到指定量级可申请独立 SenderId 使用，详情请联系 [腾讯云短信小助手](https://cloud.tencent.com/document/product/382/3773#.E6.8A.80.E6.9C.AF.E4.BA.A4.E6.B5.81)。 */
  SenderId: "",
}
// 通过client对象调用想要访问的接口，需要传入请求对象以及响应回调函数
client.SendSms(params, function (err, response) {
  // 请求异常返回，打印异常信息
  if (err) {
    console.log(err)
    return
  }
  // 请求正常返回，打印response对象
  console.log(response)
})

/* 当出现以下错误码时，快速解决方案参考
 * [FailedOperation.SignatureIncorrectOrUnapproved](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Afailedoperation.signatureincorrectorunapproved-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
 * [FailedOperation.TemplateIncorrectOrUnapproved](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Afailedoperation.templateincorrectorunapproved-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
 * [UnauthorizedOperation.SmsSdkAppIdVerifyFail](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Aunauthorizedoperation.smssdkappidverifyfail-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
 * [UnsupportedOperation.ContainDomesticAndInternationalPhoneNumber](https://cloud.tencent.com/document/product/382/9558#.E7.9F.AD.E4.BF.A1.E5.8F.91.E9.80.81.E6.8F.90.E7.A4.BA.EF.BC.9Aunsupportedoperation.containdomesticandinternationalphonenumber-.E5.A6.82.E4.BD.95.E5.A4.84.E7.90.86.EF.BC.9F)
 * 更多错误，可咨询[腾讯云助手](https://tccc.qcloud.com/web/im/index.html#/chat?webAppId=8fa15978f85cb41f7e2ea36920cb3ae1&title=Sms)
*/

      
    } catch (error) {
      console.error('发送短信时出现异常:', error);
      return {
        success: false,
        message: `网络异常: ${error.message}`
      };
    }
  }

  /**
   * 发送验证码短信（使用腾讯云API）
   */
  async sendVerificationCode(phoneNumber, code) {
    try {
      console.log(`准备发送短信到: ${phoneNumber}, 验证码: ${code}`);
      
      // 生成请求时间戳
      const timestamp = Math.floor(Date.now() / 1000);
      const date = moment.unix(timestamp).utc().format('YYYY-MM-DD');
      
      // 构造规范请求
      const payload = {
        PhoneNumberSet: [`+86${phoneNumber}`],
        SmsSdkAppId: smsConfig.smsSdkAppId,
        SignName: smsConfig.signName,
        TemplateId: smsConfig.templateId,
        // 重要：你的模板只需要一个参数 {1}（验证码）
        TemplateParamSet: [code] 
      };
      
      const canonicalRequest = [
        'POST',
        '/',
        '',
        `content-type:application/json; charset=utf-8`,
        `host:${smsConfig.endpoint}`,
        '',
        'content-type;host',
        crypto.createHash('SHA256').update(JSON.stringify(payload)).digest('hex')
      ].join('\n');
      
      // 构造待签名字符串
      const credentialScope = `${date}/${smsConfig.service}/tc3_request`;
      const stringToSign = [
        smsConfig.algorithm,
        timestamp,
        credentialScope,
        crypto.createHash('SHA256').update(canonicalRequest).digest('hex')
      ].join('\n');
      
      // 生成签名
      const signature = this.generateSignature(
        smsConfig.secretKey, 
        date, 
        smsConfig.service, 
        stringToSign
      );
      
      // 构造Authorization头
      const authorization = [
        `${smsConfig.algorithm} Credential=${smsConfig.secretId}/${credentialScope},`,
        `SignedHeaders=content-type;host,`,
        `Signature=${signature}`
      ].join(' ');
      
      // 发送HTTP请求
      const response = await fetch(`https://${smsConfig.endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'Host': smsConfig.endpoint,
          'X-TC-Action': smsConfig.action,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': smsConfig.version,
          'X-TC-Region': smsConfig.region
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (result.Response && result.Response.SendStatusSet) {
        const sendStatus = result.Response.SendStatusSet[0];
        
        if (sendStatus.Code === 'Ok') {
          console.log(`腾讯云短信发送成功: ${phoneNumber}`);
          return {
            success: true,
            requestId: result.Response.RequestId
          };
        } else {
          console.error('腾讯云短信发送失败:', sendStatus.Code, sendStatus.Message);
          return {
            success: false,
            message: `发送失败: ${sendStatus.Message} (${sendStatus.Code})`
          };
        }
      } else if (result.Response.Error) {
        console.error('腾讯云API错误:', result.Response.Error);
        return {
          success: false,
          message: `API错误: ${result.Response.Error.Message} (${result.Response.Error.Code})`
        };
      } else {
        console.error('未知响应格式:', result);
        return {
          success: false,
          message: '未知响应格式'
        };
      }
      
    } catch (error) {
      console.error('发送短信时出现异常:', error);
      return {
        success: false,
        message: `网络异常: ${error.message}`
      };
    }
  }

  /**
   * 模拟发送（开发和测试用）
   */
  async sendVerificationCodeMock(phoneNumber, code) {
    console.log(`【腾讯云模拟短信】发送到 ${phoneNumber}`);
    console.log(`【模板内容】验证码为：${code}，您正在登录AutoMagic，若非本人操作，请勿泄露。`);
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      success: true,
      message: '模拟发送成功'
    };
  }

  /**
   * 格式化手机号
   */
  formatPhoneNumber(phone) {
    const cleanPhone = phone.replace(/\s+/g, '');
    if (/^1[3-9]\d{9}$/.test(cleanPhone)) {
      return cleanPhone;
    }
    throw new Error('手机号格式错误');
  }
}

module.exports = new TencentSmsService();