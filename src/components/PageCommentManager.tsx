import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, Shield, EyeOff, Eye, Trash2, Clock, 
  FileWarning, Search, Image as ImageIcon, 
  Plus, X, Send, MessageSquare, AlertCircle, Sparkles,
  ThumbsUp, Share2, Smile, Camera
} from 'lucide-react';
import { toast } from 'sonner';

interface FacebookPage {
  id: string;
  page_name: string;
  shop_id: string;
}

interface FacebookAdPost {
  id: string;
  page_id: string;
  ad_id: string | null;
  post_title: string | null;
  preview_url: string | null;
  created_time: string;
}

interface AdPostComment {
  id: string;
  post_id: string;
  from_name: string;
  from_id: string;
  message: string;
  is_hidden: boolean;
  created_time: string;
}

export const PageCommentManager = () => {
  const navigate = useNavigate();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  
  const [posts, setPosts] = useState<FacebookAdPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string>('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [syncingPosts, setSyncingPosts] = useState(false);
  const [syncingPages, setSyncingPages] = useState(false);

  const [comments, setComments] = useState<AdPostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [syncingComments, setSyncingComments] = useState(false);

  const [authError, setAuthError] = useState(false);
  const [commentActionLoading, setCommentActionLoading] = useState<string | null>(null);

  // Custom confirmation modal states for running reliably within sandboxed iframes
  const [deleteConfirmPostId, setDeleteConfirmPostId] = useState<string | null>(null);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null);

  // 发布动态 Modal State
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const [publishImageUrl, setPublishImageUrl] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);

  // 回复评论/悬浮输入栏 State
  const [replyMessage, setReplyMessage] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const checkOAuthError = (err: any) => {
    const responseData = err.response?.data;
    const errorDetail = responseData?.error;
    const errorMsg = errorDetail?.message || responseData?.message || err.message || '';
    const errorType = errorDetail?.type || '';

    const isOAuth = 
      err.response?.status === 401 || 
      errorType === 'OAuthException' || 
      errorMsg.includes('OAuthException') || 
      errorMsg.includes('OAuth Exception') ||
      JSON.stringify(responseData).includes('OAuthException') ||
      errorMsg.includes('190');

    if (isOAuth) {
      setAuthError(true);
      return true;
    }
    return false;
  };

  // 一键物理删除并同步下架 Meta 帖子 (问题二)
  const handleDeletePost = (e: React.MouseEvent, postId: string) => {
    e.stopPropagation(); // 阻止冒泡激活贴文选择
    setDeleteConfirmPostId(postId);
  };

  const executeDeletePost = async (postId: string) => {
    try {
      toast.loading('正在极速发起 Meta 下架申请与本地库同步...', { id: 'delete-post' });
      const { data } = await axios.delete(`/api/pages/post/${postId}`);
      if (data.success) {
        toast.success(data.message || '帖文下架并物理解绑成功！', { id: 'delete-post' });
        setPosts(prev => prev.filter(p => p.id !== postId));
        if (selectedPostId === postId) {
          setSelectedPostId('');
          setComments([]);
        }
      }
    } catch (err: any) {
      if (checkOAuthError(err)) {
        toast.dismiss('delete-post');
      } else {
        toast.error('物理下架同步失败: ' + (err.response?.data?.message || err.message), { id: 'delete-post' });
      }
    }
  };

  // 即时同步评论回复至 Meta 帖子 (问题一)
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyMessage.trim() || !selectedPostId) return;
    setSubmittingReply(true);
    try {
      const { data } = await axios.post(`/api/pages/post/${selectedPostId}/comment`, {
        message: replyMessage
      });
      if (data.success) {
        toast.success('已同步成功在前台发布评论回复！');
        setReplyMessage('');
        // Sync local view immediately
        setComments(prev => [data.comment, ...prev]);
      }
    } catch (err: any) {
      if (!checkOAuthError(err)) {
        toast.error('发评同步失败: ' + (err.response?.data?.message || err.message));
      }
    } finally {
      setSubmittingReply(false);
    }
  };

  // Fetch Pages
  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      const { data } = await axios.get('/api/pages');
      let pageList: FacebookPage[] = [];
      if (Array.isArray(data)) {
        pageList = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray((data as any).data)) {
          pageList = (data as any).data;
        } else if (Array.isArray((data as any).pages)) {
          pageList = (data as any).pages;
        }
      }
      setPages(pageList);
      if (pageList.length > 0 && !selectedPageId) {
        setSelectedPageId(pageList[0].id);
      }
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('获取公共主页列表失败');
      }
    }
  };

  const handleSyncPages = async () => {
    setSyncingPages(true);
    setAuthError(false);
    try {
      const { data } = await axios.post('/api/pages/sync');
      if (data.success) {
        toast.success('Facebook 公共主页列表同步完成');
        await fetchPages();
      }
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('同步公共主页失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setSyncingPages(false);
    }
  };

  // Fetch Posts when selected Page changes
  useEffect(() => {
    if (selectedPageId) {
      fetchPosts(selectedPageId);
      setSelectedPostId('');
      setComments([]);
    }
  }, [selectedPageId]);

  const fetchPosts = async (pageId: string) => {
    setLoadingPosts(true);
    try {
      const { data } = await axios.get(`/api/pages/${pageId}/posts`);
      setPosts(data || []);
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('获取贴文流失败');
      }
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleSyncPosts = async () => {
    if (!selectedPageId) return;
    setSyncingPosts(true);
    setAuthError(false);
    try {
      const { data } = await axios.post(`/api/pages/${selectedPageId}/fetch-ads`);
      if (data.warnings && data.warnings.length > 0) {
        toast('⚠️ 仅抓取到时间线帖子', {
          description: `Token 缺少 ads_read 权限，无法获取全量广告帖文。若需获取广告帖，请在系统设置中重新授权。(${data.warnings[0]})`,
          duration: 8000
        });
      } else {
        toast.success('抓取广告贴完成');
      }
      await fetchPosts(selectedPageId);
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('同步广告贴失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setSyncingPosts(false);
    }
  };

  // Fetch Comments when selected Post changes
  useEffect(() => {
    if (selectedPostId) {
      fetchComments(selectedPostId);
    } else {
      setComments([]);
    }
  }, [selectedPostId]);

  const fetchComments = async (postId: string) => {
    setLoadingComments(true);
    try {
      const { data } = await axios.get(`/api/pages/post/${postId}/comments`);
      setComments(data || []);
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('获取评论记录失败');
      }
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSyncComments = async () => {
    if (!selectedPostId) return;
    setSyncingComments(true);
    setAuthError(false);
    try {
      const { data } = await axios.post(`/api/pages/post/${selectedPostId}/fetch-comments`);
      if (data.warnings && data.warnings.length > 0) {
        toast.warning('获取部分评论，存在警告: ' + data.warnings[0]);
      } else {
        toast.success('同步最新评论完成');
      }
      await fetchComments(selectedPostId);
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('同步评论失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setSyncingComments(false);
    }
  };

  const handleToggleHide = async (commentId: string, currentHidden: boolean) => {
    if (authError) return;
    const targetHidden = !currentHidden;
    setCommentActionLoading(commentId + '_hide');
    try {
      const { data } = await axios.post(`/api/pages/comment/${commentId}/toggle-hide`, {
        is_hidden: targetHidden
      });
      if (data.success) {
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_hidden: data.is_hidden } : c));
        toast.success(data.is_hidden ? '评论已隐藏' : '评论已取消隐藏');
      }
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('操作失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setCommentActionLoading(null);
    }
  };

  const handleDelete = (commentId: string) => {
    setDeleteConfirmCommentId(commentId);
  };

  const executeDeleteComment = async (commentId: string) => {
    if (authError) return;
    setCommentActionLoading(commentId + '_delete');
    try {
      const { data } = await axios.delete(`/api/pages/comment/${commentId}`);
      if (data.success) {
        const el = document.getElementById(`comment-${commentId}`);
        if (el) {
           el.classList.add('animate-out', 'fade-out', 'duration-300');
           setTimeout(() => {
             setComments(prev => prev.filter(c => c.id !== commentId));
             toast.success('评论已彻底删除');
           }, 300);
        } else {
           setComments(prev => prev.filter(c => c.id !== commentId));
           toast.success('评论已彻底删除');
        }
      }
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('删除失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setCommentActionLoading(null);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPageId) return;
    setSubmittingPost(true);
    try {
      const { data } = await axios.post(`/api/pages/${selectedPageId}/publish-post`, {
        message: publishMessage,
        image_url: publishImageUrl
      });
      if (data.success) {
        toast.success('动态已成功发布至 Meta 公共主页并同步本地');
        setShowPublishModal(false);
        setPublishMessage('');
        setPublishImageUrl('');
        await fetchPosts(selectedPageId);
      }
    } catch (e: any) {
      if (!checkOAuthError(e)) {
        toast.error('发布失败: ' + (e.response?.data?.error || e.message));
      }
    } finally {
      setSubmittingPost(false);
    }
  };

  const safePages = Array.isArray(pages) ? pages : [];
  const filteredPages = safePages.filter(p => 
    p && ((p.page_name || '').toLowerCase().includes(pageSearchQuery.toLowerCase()) || 
    (p.id || '').includes(pageSearchQuery))
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white border border-gray-200 rounded-2xl relative font-sans text-gray-700 shadow-sm">
      
      {/* 401 Auth Error Overlay */}
      {authError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-red-200 p-8 rounded-2xl shadow-xl text-center max-w-md w-full mx-4 border-t-4 border-t-red-500">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5 border border-red-100">
              <AlertCircle className="w-8 h-8 text-red-500 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">主页授权已过期或失效</h2>
            <p className="text-gray-500 text-xs mb-6 leading-relaxed">
              您的 Facebook 公共主页授权 Token 已过期！请前往「系统设置」重新绑定或刷新 Meta 授权以激活本公共主页的防灌水控评功能。
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setAuthError(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs px-5 py-2.5 rounded-lg transition-all active:scale-95 cursor-pointer"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setAuthError(false);
                  navigate('/?tab=settings');
                }}
                className="bg-red-600 hover:bg-red-500 text-white font-medium text-xs px-5 py-2.5 rounded-lg transition-all shadow-md shadow-red-600/10 active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                前往「系统设置」重新绑定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="flex-none px-6 py-4.5 border-b border-gray-200 bg-gray-50/75 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 shadow-inner">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 tracking-wide flex items-center gap-2">
              公共主页管理
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 font-mono font-bold">META Cloud API</span>
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">即时监控主页广告帖文并对恶意、负面或灌水评论进行秒级防御与自动审计</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncPages}
            disabled={syncingPages}
            className={`flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border font-medium transition-all duration-200 ${
              syncingPages 
                ? 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed' 
                : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:border-blue-500/30 hover:text-blue-600 shadow-sm active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingPages ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
            <span>同步公共主页</span>
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 overflow-hidden bg-gray-50/50">
        
        {/* Layer 1: Pages List (3 cols) */}
        <div className="col-span-3 border-r border-gray-200 flex flex-col h-full bg-white overflow-hidden">
          <div className="flex-none p-4 border-b border-gray-150 bg-white">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索主页名称或ID..."
                value={pageSearchQuery}
                onChange={(e) => setPageSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 text-xs text-gray-900 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-gray-400 transition-all font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {safePages.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs flex flex-col items-center gap-2">
                <FileWarning className="w-6 h-6 opacity-40 text-gray-400" />
                <span>暂无可用公共主页，请点击上方同步</span>
              </div>
            ) : filteredPages.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">
                未搜索到匹配的公共主页
              </div>
            ) : (
              filteredPages.map(page => {
                const isSelected = selectedPageId === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => setSelectedPageId(page.id)}
                    className={`w-full text-left p-3 rounded-xl text-xs transition-all relative border overflow-hidden flex flex-col gap-1.5 group ${
                      isSelected 
                        ? 'bg-white border-blue-500 text-blue-700 shadow-sm shadow-blue-50/50' 
                        : 'border-transparent hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {/* Left indicator accent line */}
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-blue-500 to-blue-600 rounded-r" />
                    )}
                    
                    <div className="flex items-center justify-between gap-1 w-full">
                      <div className="font-bold truncate flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="truncate">{page.page_name || '未命名主页'}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-sans shrink-0 uppercase tracking-wider font-bold">Active</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate pl-3.5">
                      ID: {page.id}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Layer 2: Main Posts Stream (4 cols) */}
        <div className="col-span-4 border-r border-gray-250/70 flex flex-col h-full bg-white overflow-hidden">
          {selectedPageId ? (
            <>
              <div className="flex-none p-4 border-b border-gray-150 flex items-center justify-between bg-white">
                <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <span>主页帖子流</span>
                  <span className="bg-gray-100 text-[10px] px-2 py-0.5 rounded-full text-gray-500 font-mono font-bold">{posts.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPublishModal(true)}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-100 border border-blue-500"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>发动态</span>
                  </button>
                  <button
                    onClick={handleSyncPosts}
                    disabled={syncingPosts}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                      syncingPosts 
                        ? 'text-blue-500 bg-blue-50/50 border-blue-100 cursor-not-allowed' 
                        : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm'
                    }`}
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingPosts ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
                    <span>抓最新</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gray-50/30">
                {loadingPosts ? (
                  <div className="text-center py-20 text-gray-400 text-xs flex flex-col items-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                    <span>正在同步 Facebook 贴文流...</span>
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 text-xs flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-gray-100/80 border border-gray-200">
                      <FileWarning className="w-8 h-8 opacity-45 text-gray-400" />
                    </div>
                    <div className="max-w-[180px] leading-relaxed text-gray-400 text-[11px]">
                      该主页暂无任何本地贴文。您可以直接点击上方的「发动态」直接发布，或点击「抓最新」立即同步。
                    </div>
                  </div>
                ) : (
                  posts.map(post => {
                    const isSelected = selectedPostId === post.id;
                    return (
                      <div
                        key={post.id}
                        onClick={() => setSelectedPostId(post.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex flex-col gap-3 ${
                          isSelected 
                            ? 'bg-blue-50/40 border-blue-300 shadow-sm' 
                            : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-blue-500 to-blue-600 rounded-r" />
                        )}
                        
                        {/* 一键下架极速同步删除按钮 (问题二) */}
                        <button
                          onClick={(e) => handleDeletePost(e, post.id)}
                          title="一键一站式极速申请 Facebook 物理彻底下架删除"
                          className="absolute right-2.5 top-2.5 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100 border border-transparent transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex gap-3">
                          <div className={`w-14 h-14 shrink-0 rounded-lg bg-gray-100 overflow-hidden border flex items-center justify-center transition-all ${
                            isSelected ? 'border-blue-300' : 'border-gray-200'
                          }`}>
                            {post.preview_url ? (
                              <img 
                                src={post.preview_url} 
                                alt="预览" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-gray-300" />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                            <div className="text-xs font-bold text-gray-900 line-clamp-2 leading-relaxed font-sans" title={post.post_title || '无内容'}>
                              {post.post_title || (
                                <span className="text-gray-400 italic font-normal">空贴文 / 暗贴无描述 / 系统自动发布帖</span>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400 font-mono">
                              <span className="truncate"># {post.id.split('_').pop() || post.id}</span>
                              <span className="flex items-center gap-1 shrink-0 ml-1">
                                <Clock className="w-2.5 h-2.5 opacity-60" />
                                {new Date(post.created_time).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-450 bg-gray-50/20 p-6 text-center">
              <Search className="w-10 h-10 mb-3 opacity-15 text-gray-400" />
              <p className="text-xs text-gray-400 max-w-[180px] leading-relaxed">
                请先在左侧选择需要防灌水控评的公共主页
              </p>
            </div>
          )}
        </div>

        {/* Layer 3: Main Active Comments Panel (5 cols) */}
        <div className="col-span-5 flex flex-col h-full bg-white overflow-hidden relative">
          {selectedPostId ? (
            <>
              {/* Header */}
              <div className="flex-none p-4 border-b border-gray-150 flex items-center justify-between bg-white shadow-sm relative z-10">
                <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600 animate-pulse" />
                  <span>评论狙击舱</span>
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">{comments.length}</span>
                </div>
                <button
                  onClick={handleSyncComments}
                  disabled={syncingComments}
                  className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                    syncingComments 
                      ? 'text-teal-500 bg-teal-50/50 border-teal-100 cursor-not-allowed' 
                      : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm hover:text-blue-600'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingComments ? 'animate-spin text-teal-500' : 'text-gray-500'}`} />
                  <span>同步 Meta 评论流</span>
                </button>
              </div>

              {/* Scrolling Facebook Post Feed Context */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative bg-[#f0f2f5]/50">
                {/* 1. Facebook Premium Style Card layout (如图一的方式打开) */}
                {(() => {
                  const currentPost = posts.find(p => p.id === selectedPostId);
                  const currentPage = safePages.find(p => p.id === selectedPageId);
                  if (!currentPost) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
                      {/* Post Header */}
                      <div className="p-3.5 flex items-center justify-between pb-2.5">
                        <div className="flex items-center gap-2.5">
                          {/* Circular Page Avatar Initial badge looking like custom logo */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-sm border border-blue-400/20 shadow-inner select-none uppercase font-sans">
                            {currentPage?.page_name ? currentPage.page_name.charAt(0) : 'P'}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-900 leading-snug tracking-wide flex items-center gap-1.5">
                              {currentPage?.page_name || 'Nowofo-1'}
                              <span className="inline-block w-3 h-3 bg-blue-500 text-white rounded-full flex items-center justify-center text-[7px]" title="Meta 官方企业验证/认证白名单">✓</span>
                            </span>
                            <span className="text-[10px] text-gray-400 tracking-tight leading-none mt-0.5 font-sans">
                              发布于 {new Date(currentPost.created_time).toLocaleString()} · 🌐
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Post description statement text */}
                      <div className="px-4 pb-3">
                        <p className="text-xs text-gray-800 leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
                          {currentPost.post_title || (
                            <span className="text-gray-400 italic">空贴文 / 暗贴无描述 / 系统自动发布贴</span>
                          )}
                        </p>
                      </div>

                      {/* Post Material Picture Render Frame (图一) */}
                      {currentPost.preview_url && (
                        <div className="bg-[#0e0e11] border-y border-gray-100 flex items-center justify-center relative select-none w-full max-h-[380px] overflow-hidden">
                          <img 
                            src={currentPost.preview_url} 
                            alt="贴文原图素材" 
                            className="max-h-[380px] object-contain w-full"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Comments List Header */}
                <div className="flex items-center justify-between pt-1 font-semibold text-gray-650 text-[11px] px-1 select-none">
                  <span>最相关 ▾</span>
                  <span>全量已加载 {comments.length} 条</span>
                </div>

                {/* 3. Render list of speech bubble comments */}
                {loadingComments ? (
                  <div className="py-20 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-150 shadow-xs">
                    <div className="text-gray-400 text-xs flex flex-col items-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      <span>正在全量同步拉取最新评论流...</span>
                    </div>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-16 px-6 bg-white border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-center shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mb-3 text-gray-400">
                      <MessageSquare className="w-4 h-4 opacity-45" />
                    </div>
                    <p className="text-xs text-gray-450 max-w-[240px] leading-relaxed">
                      该帖文暂无任何评论。可在下方直接发表评论，将极速同步至真实 Facebook 帖子下！
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map(comment => {
                      const isHidden = comment.is_hidden;
                      return (
                        <div
                          key={comment.id}
                          id={`comment-${comment.id}`}
                          className={`flex items-start gap-2.5 group relative transition-all duration-200 ${
                            isHidden ? 'opacity-65' : ''
                          }`}
                        >
                          {/* Circular User Avatar */}
                          <div className={`w-8 h-8 shrink-0 rounded-full font-bold text-xs flex items-center justify-center text-white border select-none ${
                            isHidden 
                              ? 'bg-gradient-to-br from-gray-400 to-gray-500 border-gray-300' 
                              : 'bg-gradient-to-br from-[#1877f2] to-blue-600 border-blue-400'
                          }`}>
                            {comment.from_name ? comment.from_name.charAt(0).toUpperCase() : '?'}
                          </div>

                          {/* Speech bubble & Controls */}
                          <div className="flex-1 flex flex-col gap-1 min-w-0">
                            {/* The comment text container bubble (图二) */}
                            <div className="bg-white border border-gray-250/60 p-3 rounded-2xl shadow-xs inline-block max-w-full">
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                                <span className="font-bold text-gray-900 text-xs tracking-wide truncate">
                                  {comment.from_name || '主页访客'}
                                </span>
                                <span className="text-[9px] text-[#8a8d91] font-mono shrink-0">
                                  {new Date(comment.created_time).toLocaleString('zh-CN', { hour12: false })}
                                </span>
                              </div>
                              <p className={`text-xs text-gray-800 leading-relaxed font-sans whitespace-pre-wrap select-text break-words ${
                                isHidden ? 'text-gray-400 line-through decoration-gray-300' : ''
                              }`}>
                                {comment.message}
                              </p>
                            </div>

                            {/* Actions & Status badges */}
                            <div className="flex items-center gap-2 flex-wrap pl-2 text-[10px]">
                              {isHidden ? (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.2 rounded font-sans tracking-tight font-bold shrink-0">
                                  <EyeOff className="w-2.5 h-2.5" />
                                  [已隐藏]
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.2 rounded font-sans tracking-tight font-bold shrink-0">
                                  <Eye className="w-2.5 h-2.5" />
                                  [公开中]
                                </span>
                              )}

                              <button
                                onClick={() => handleToggleHide(comment.id, comment.is_hidden)}
                                disabled={commentActionLoading === comment.id + '_hide'}
                                className={`font-bold transition-all p-1 hover:underline cursor-pointer flex items-center gap-0.5 ${
                                  isHidden ? 'text-blue-600' : 'text-amber-700'
                                }`}
                              >
                                {isHidden ? '恢复展现评论' : '一键防灌水隐藏'}
                              </button>

                              {isHidden && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <button
                                    onClick={() => handleDelete(comment.id)}
                                    disabled={commentActionLoading === comment.id + '_delete'}
                                    className="text-red-500 hover:text-red-700 font-bold p-1 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    物理彻底删除
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Floating Reply Bar at the bottom (悬浮回复窗口 - 具备回复后同步到facebook帖子下) */}
              <form onSubmit={handleSendReply} className="flex-none p-4 border-t border-gray-150 bg-white shadow-xl relative z-20 flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  {/* Page initial letter avatar indicator */}
                  <div className="w-8 h-8 shrink-0 rounded-full bg-[#1877f2] text-white flex items-center justify-center text-xs font-bold font-mono shadow-md border border-blue-400 select-none">
                    {safePages.find(p => p.id === selectedPageId)?.page_name?.charAt(0).toUpperCase() || 'P'}
                  </div>

                  {/* Input form panel mimicking Facebook layout */}
                  <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2 flex flex-col gap-1.5 border border-transparent focus-within:border-gray-200 focus-within:bg-white transition-all">
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder={`以 ${safePages.find(p => p.id === selectedPageId)?.page_name || 'Nowofo-1'} 的身份评论此贴文...`}
                      rows={2}
                      className="w-full bg-transparent text-xs text-gray-900 border-none outline-none resize-none focus:ring-0 placeholder:text-gray-400 p-0 font-sans"
                      disabled={submittingReply}
                    />

                    {/* Meta styled formatting tool support and instant action */}
                    <div className="flex items-center justify-between border-t border-gray-200/50 pt-2 mt-1">
                      <div className="flex items-center gap-2.5 text-gray-400">
                        <button type="button" className="hover:text-gray-600 transition-colors" title="选择表情情绪"><Smile className="w-4 h-4" /></button>
                        <button type="button" className="hover:text-gray-600 transition-colors" title="添加照片、GIF或贴画素材"><Camera className="w-4 h-4" /></button>
                        <button type="button" className="hover:text-gray-600 transition-colors text-[9px] font-black shrink-0 tracking-tight bg-gray-200/80 px-1 py-0.5 rounded">GIF</button>
                        <button type="button" className="hover:text-gray-600 transition-colors" title="附带贴纸"><ImageIcon className="w-4 h-4" /></button>
                      </div>

                      <button
                        type="submit"
                        disabled={submittingReply || !replyMessage.trim()}
                        className="p-1 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-all font-bold text-[11px] flex items-center gap-1 shadow-sm active:scale-95"
                      >
                        {submittingReply ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <Send className="w-3 h-3 text-white" />
                        )}
                        <span>即时同步发评</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50/10 p-6 text-center">
              <Shield className="w-10 h-10 mb-3 opacity-15 text-gray-400" />
              <p className="text-xs max-w-[200px] leading-relaxed">
                在左侧选择对应的主页帖子，即可加载全量拦截评论狙击舱
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Publish Modal ("发动态") */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in" onClick={() => !submittingPost && setShowPublishModal(false)}></div>
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl transition-all flex flex-col max-h-[90vh] border-t-4 border-t-blue-500 animate-slide-up">
            <div className="bg-gray-50/75 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                <span className="text-xs font-black text-gray-900 uppercase tracking-wider">即时发布动态至公共主页</span>
              </div>
              <button 
                onClick={() => !submittingPost && setShowPublishModal(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors rounded-lg p-1 hover:bg-gray-100"
                disabled={submittingPost}
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-[11px] text-blue-700 leading-relaxed font-medium">
                📢 该功能绕过传统慢速抓取，直接利用 <strong>Page Access Token</strong> 将文案与图片极速同步至您的 Meta 公共主页并在本地立刻录库，可以立刻在前台用于控评功能拦截测试！
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">目标主页授权</label>
                <div className="w-full px-3.5 py-2.5 bg-gray-50 text-xs text-blue-700 border border-gray-200 rounded-lg font-mono font-bold select-none">
                  ⚡ {safePages.find(p => p.id === selectedPageId)?.page_name || '未指定主页'} (ID: {selectedPageId})
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">贴文文案内容 (Message)</label>
                  <span className="text-[10px] text-gray-400">必填</span>
                </div>
                <textarea
                  value={publishMessage}
                  onChange={(e) => setPublishMessage(e.target.value)}
                  placeholder="请输入要发布到公共主页的贴文文案内容..."
                  rows={4}
                  className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-lg text-gray-900 text-xs px-3.5 py-2.5 focus:outline-none placeholder:text-gray-400 resize-none font-sans leading-relaxed transition-all"
                  disabled={submittingPost}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">配图网络素材 URL (Image URL)</label>
                  <span className="text-[10px] text-gray-400">选填</span>
                </div>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="url"
                    value={publishImageUrl}
                    onChange={(e) => setPublishImageUrl(e.target.value)}
                    placeholder="请输入配图的公网链接 (例: https://example.com/pic.jpg)..."
                    className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-lg text-gray-900 text-xs pl-9 pr-3 py-2 focus:outline-none placeholder:text-gray-400 font-mono transition-all"
                    disabled={submittingPost}
                  />
                </div>
              </div>

              {publishImageUrl && (
                <div className="mt-1">
                  <p className="text-[9px] text-gray-400 mb-1">图片素材效果预览 (若无法显示请确认跨域机制及有效性):</p>
                  <div className="max-h-28 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 p-1.5 flex items-center justify-center">
                    <img 
                      src={publishImageUrl} 
                      alt="素材预览" 
                      className="max-h-24 max-w-full object-contain rounded"
                      onError={(e: any) => { e.target.src = 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=640'; }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => !submittingPost && setShowPublishModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs transition-colors disabled:opacity-50"
                  disabled={submittingPost}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingPost}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 border border-blue-700"
                >
                  {submittingPost ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>正在极速发帖并录库...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>确认物理发布动态</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Delete Confirmation Modal */}
      {deleteConfirmPostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs transition-opacity duration-300" onClick={() => setDeleteConfirmPostId(null)}></div>
          <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl transition-all p-5 flex flex-col border-t-4 border-t-red-500 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 rounded-full border border-red-100 text-red-500 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900">同步下架删除贴文</h3>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  确定要彻底在 Facebook 上下架物理删除该贴文吗？已有评论也将随之彻底抹除，并在本地库中解绑。此操作极度不可逆！
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeleteConfirmPostId(null)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-[11px] font-bold text-gray-700 transition-all active:scale-95 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmPostId;
                  setDeleteConfirmPostId(null);
                  executeDeletePost(id);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                确定物理下架
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Delete Confirmation Modal */}
      {deleteConfirmCommentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs transition-opacity duration-300" onClick={() => setDeleteConfirmCommentId(null)}></div>
          <div className="relative w-full max-w-sm bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl transition-all p-5 flex flex-col border-t-4 border-t-red-500 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 rounded-full border border-red-100 text-red-500 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900">物理彻底删除评论</h3>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  确定要彻底删除这条评论吗？此操作不可逆！
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeleteConfirmCommentId(null)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-[11px] font-bold text-gray-700 transition-all active:scale-95 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmCommentId;
                  setDeleteConfirmCommentId(null);
                  executeDeleteComment(id);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                确定删除评论
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Global generic CSS for scrollbar and animations */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(241, 245, 249, 0.5); 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(203, 213, 225, 0.8); 
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.8); 
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};
