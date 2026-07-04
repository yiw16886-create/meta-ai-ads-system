import React from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 sm:p-12">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8 border-b pb-6">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">隐私政策 (Privacy Policy)</h1>
              <p className="text-sm text-gray-500">更新日期：2026年7月3日</p>
            </div>
          </div>

          {/* Navigation Back */}
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors">
              <ArrowLeft className="w-4 h-4" /> 返回系统首页
            </Link>
          </div>

          {/* Content */}
          <div className="space-y-6 text-gray-600 leading-relaxed text-sm">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">1. 信息收集与使用</h2>
              <p>
                我们的应用（“本系统”）提供企业级的 Meta (Facebook) 广告数据管理与智能分析服务。
                为了实现相关功能，在获得您明确授权的前提下，我们将通过 Meta 官方 OAuth 2.0 授权机制获取您的以下信息：
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 pl-4">
                <li><strong>广告账户读取权限 (ads_read)</strong>：用于拉取并分析您名下的广告账户消耗、曝光、转化等报表数据。</li>
                <li><strong>广告账户管理权限 (ads_management)</strong>：用于在您主动操作时协助管理广告状态，进行智能启停及策略下发。</li>
                <li><strong>商业账户管理权限 (business_management)</strong>：用于读取您的 BM 业务管理器基本状态，协助进行健康的 BM 批量管理。</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">2. 数据安全与存储</h2>
              <p>
                我们深知您数据的敏感性。所有通过 Meta API 获取的数据仅用于本系统内部的管理后台展示，通过加密传输协议（HTTPS）传递，
                并安全保存在受保护的云数据库中。<strong>我们承诺绝对不会向任何第三方租售、共享您的业务数据。</strong>
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">3. 用户授权的撤销与数据删除</h2>
              <p>
                您拥有随时撤销授权并要求我们删除已收集数据的权利：
              </p>
              <p className="mt-1">
                - 您可以随时通过系统设置面板，点击“解除绑定”来清除我们服务器存储的 Facebook 访问令牌。<br />
                - 具体的删除步骤和机制，请参阅我们的 <Link to="/data-deletion-instructions" className="text-blue-500 hover:underline">数据删除说明页面</Link>。
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">4. 隐私政策的修改</h2>
              <p>
                我们可能会适时对本隐私政策进行更新。任何修改都将在此页面发布，并在发布时立即生效。建议您定期查看此页面以获取最新信息。
              </p>
            </section>

            <section className="border-t pt-6 mt-8">
              <h2 className="text-base font-semibold text-gray-900 mb-1">联系我们</h2>
              <p>如果您对本隐私政策或数据处理有任何疑问，请通过管理员邮箱与我们联系。</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
