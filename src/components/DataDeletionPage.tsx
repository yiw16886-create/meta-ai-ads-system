import React from "react";
import { Link } from "react-router-dom";
import { Trash2, ArrowLeft } from "lucide-react";

export function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 sm:p-12">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8 border-b pb-6">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">数据删除说明 (Data Deletion Instructions)</h1>
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
            <p>
              根据 Facebook 的应用开放平台政策，我们提供标准的“应用数据删除请求回调机制”以及手动的删除指引说明。
              如果您想删除有关您在我们的应用中进行的 Facebook 授权及关联数据，请按照以下指南操作：
            </p>

            <section className="bg-amber-50/50 border border-amber-100 rounded-lg p-6 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                方式一：通过 Facebook 官方设置解除并删除授权数据
              </h2>
              <ol className="list-decimal list-inside space-y-2 pl-2">
                <li>登录您的 Facebook 账户。</li>
                <li>前往您个人账户的 <strong>设置与隐私 (Settings & Privacy)</strong> &gt; <strong>设置 (Settings)</strong>。</li>
                <li>在左侧菜单栏中，找到并点击 <strong>应用和网站 (Apps and Websites)</strong>。</li>
                <li>在列表中找到我们的应用，并点击 <strong>移除 (Remove)</strong> 按钮。</li>
                <li>在弹出的确认框中，勾选“同时删除本应用在 Facebook 上为您发布的所有帖子、视频或活动”（如有），然后点击 <strong>移除</strong>。</li>
                <li>完成移除后，Facebook 将会向我们的服务器发送一则撤销授权回调通知，我们将会自动清理对应的授权令牌和临时账户缓存。</li>
              </ol>
            </section>

            <section className="bg-blue-50/30 border border-blue-100 rounded-lg p-6 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                方式二：在系统后台直接断开并删除数据
              </h2>
              <ol className="list-decimal list-inside space-y-2 pl-2">
                <li>登录本系统管理后台。</li>
                <li>点击导航栏的 <strong>系统设置 (Settings)</strong> 菜单。</li>
                <li>在 <strong>Facebook 登录授权 / 账户绑定</strong> 卡片中，点击 <strong>“解除 Facebook 绑定”</strong> 按钮。</li>
                <li>确认后，系统将彻底销毁存储在数据库中的长效访问令牌（User Access Token），并解除所有的广告账户代理同步关系。</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">手动删除请求与核实</h2>
              <p>
                如果您希望彻底删除本系统存储的所有相关广告缓存报表、配置及账户绑定，
                您可以直接给管理员发送邮件提出删除申请。请在邮件中提供您的 <strong>Facebook 用户 ID (Scoped User ID)</strong>，
                我们在验证您的身份后，将在 3 个工作日内，从生产数据库和所有备份日志中彻底删除属于您的所有业务数据。
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
