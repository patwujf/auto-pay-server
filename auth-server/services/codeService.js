// services/codeService.js
const smsConfig = require('../config/tencentSmsConfig');
const tencentSmsService = require('./tencentSmsService');

class CodeService {
  constructor() {
    this.codeStorage = new Map();
    this.sendHistory = new Map(); // 发送历史记录
    
    // 每分钟清理过期验证码
    setInterval(() => this.cleanExpiredCodes(), 60 * 1000);
    
    console.log('验证码服务已启动');
  }

  /**
   * 生成并发送验证码
   */
  async generateAndSendCode(phoneNumber) {
    try {
      // 验证手机号格式
      if (!this.validatePhoneNumber(phoneNumber)) {
        return {
          success: false,
          message: '手机号格式不正确'
        };
      }

      // 检查发送频率限制
      const rateLimitResult = this.checkRateLimit(phoneNumber);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          message: rateLimitResult.message
        };
      }

      // 生成6位数字验证码
      const code = Math.random().toString().slice(2, 8);
      const codeData = {
        code: code,
        createdAt: Date.now(),
        attempts: 0,
        used: false,
        sendCount: (this.codeStorage.get(phoneNumber)?.sendCount || 0) + 1
      };

      // 存储验证码
      this.codeStorage.set(phoneNumber, codeData);

      // 记录发送历史
      this.recordSendHistory(phoneNumber);

      // 选择发送方式
      const useMock = this.shouldUseMock();
      const sendResult = useMock 
        ? await tencentSmsService.sendVerificationCodeMock(phoneNumber, code)
        : await tencentSmsService.sendVerificationCode2(phoneNumber, code);

      if (sendResult.success) {
        console.log(`验证码发送成功: ${phoneNumber}`);
        return { 
          success: true, 
          code: useMock ? code : undefined, // 开发环境返回验证码
          message: useMock ? '模拟发送成功' : '短信发送成功'
        };
      } else {
        // 发送失败，删除存储的验证码
        this.codeStorage.delete(phoneNumber);
        return { 
          success: false, 
          message: sendResult.message || '短信发送失败，请稍后重试'
        };
      }
    } catch (error) {
      console.error('生成验证码时出错:', error);
      return {
        success: false,
        message: '系统错误，请稍后重试'
      };
    }
  }

  /**
   * 验证手机号格式
   */
  validatePhoneNumber(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
  }

  /**
   * 检查发送频率限制
   */
  checkRateLimit(phoneNumber) {
    const now = Date.now();
    const history = this.sendHistory.get(phoneNumber) || [];
    
    // 过滤出1分钟内的记录
    const recentSends = history.filter(time => now - time < 60 * 1000);
    
    // 60秒内只能发送1次
    if (recentSends.length >= 1) {
      const lastSend = Math.max(...recentSends);
      const waitSeconds = Math.ceil((60 * 1000 - (now - lastSend)) / 1000);
      return {
        allowed: false,
        message: `请求过于频繁，请${waitSeconds}秒后再试`
      };
    }
    
    // 1小时内最多发送5次
    const hourlySends = history.filter(time => now - time < 3600 * 1000);
    if (hourlySends.length >= 5) {
      return {
        allowed: false,
        message: '今日发送次数已达上限，请明天再试'
      };
    }
    
    return { allowed: true };
  }

  /**
   * 记录发送历史
   */
  recordSendHistory(phoneNumber) {
    const history = this.sendHistory.get(phoneNumber) || [];
    history.push(Date.now());
    
    // 只保留24小时内的记录
    const filteredHistory = history.filter(time => 
      Date.now() - time < 24 * 3600 * 1000
    );
    
    this.sendHistory.set(phoneNumber, filteredHistory);
  }

  /**
   * 判断是否使用模拟发送
   */
  shouldUseMock() {
    return  true;
    /*process.env.NODE_ENV === 'development' || 
           !smsConfig.secretId || 
           smsConfig.secretId === '你的SecretId';
  */
           }

  /**
   * 验证验证码
   */
  verifyCode(phoneNumber, inputCode) {
    const codeData = this.codeStorage.get(phoneNumber);
    
    if (!codeData) {
      console.log(`验证失败: ${phoneNumber} - 无验证码记录`);
      return false;
    }

    // 检查是否过期
    if (Date.now() - codeData.createdAt > smsConfig.codeExpiration * 60 * 1000) {
      this.codeStorage.delete(phoneNumber);
      console.log(`验证失败: ${phoneNumber} - 验证码已过期`);
      return false;
    }

    // 检查尝试次数
    if (codeData.attempts >= 5) {
      this.codeStorage.delete(phoneNumber);
      console.log(`验证失败: ${phoneNumber} - 尝试次数超限`);
      return false;
    }

    codeData.attempts++;

    // 验证码匹配
    if (codeData.code === inputCode && !codeData.used) {
      codeData.used = true;
      console.log(`验证成功: ${phoneNumber}`);
      return true;
    }

    console.log(`验证失败: ${phoneNumber} - 验证码不匹配，已尝试${codeData.attempts}次`);
    return false;
  }

  /**
   * 清理过期验证码
   */
  cleanExpiredCodes() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [phoneNumber, codeData] of this.codeStorage.entries()) {
      if (now - codeData.createdAt > smsConfig.codeExpiration * 60 * 1000) {
        this.codeStorage.delete(phoneNumber);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`清理了 ${cleanedCount} 个过期验证码`);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      activeCodes: this.codeStorage.size,
      sendHistorySize: this.sendHistory.size,
      storageType: 'memory'
    };
  }
}

module.exports = new CodeService();