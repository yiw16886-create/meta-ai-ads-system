export type PagePost = {
  id: string;
  message?: string;
  created_time?: string;
  full_picture?: string;
  permalink_url?: string;
  is_published?: boolean;
  from?: { id?: string; name?: string };
};

export type PageComment = {
  id: string;
  message?: string;
  created_time?: string;
  is_hidden?: boolean;
  from?: { id?: string; name?: string };
  parent?: { id?: string };
};

type GraphErrorBody = { error?: { code?: number; error_subcode?: number } };

export class PageCenterGraphError extends Error {
  constructor(code?: number, subcode?: number) {
    super(`PAGE_CENTER_GRAPH_ERROR${code ? `_${code}` : ""}${subcode ? `_${subcode}` : ""}`);
  }
}

export class MetaPagesClient {
  constructor(
    private readonly pageToken: string,
    private readonly graphVersion: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async graph<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    parameters: Record<string, string> = {},
  ) {
    const safePath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${safePath}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.pageToken}`,
    };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(10_000) };
    if (method === "GET") {
      Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
    } else if (Object.keys(parameters).length > 0) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = new URLSearchParams(parameters);
    }

    const response = await this.request(url, init);
    const body = (await response.json()) as T & GraphErrorBody;
    if (!response.ok || body.error) {
      throw new PageCenterGraphError(body.error?.code, body.error?.error_subcode);
    }
    return body;
  }

  async listPosts(pageId: string, limit: number, after?: string) {
    const response = await this.graph<{
      data?: PagePost[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${pageId}/posts`, "GET", {
      fields: "id,message,created_time,full_picture,permalink_url,is_published,from{id,name}",
      limit: String(limit),
      ...(after ? { after } : {}),
    });
    return {
      posts: response.data || [],
      nextCursor: response.paging?.next ? response.paging.cursors?.after || null : null,
    };
  }

  async listComments(postId: string, limit: number, after?: string) {
    const response = await this.graph<{
      data?: PageComment[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${postId}/comments`, "GET", {
      fields: "id,message,from{id,name},created_time,is_hidden,parent{id}",
      limit: String(limit),
      ...(after ? { after } : {}),
    });
    return {
      comments: response.data || [],
      nextCursor: response.paging?.next ? response.paging.cursors?.after || null : null,
    };
  }

  async getPost(postId: string) {
    return this.graph<PagePost>(postId, "GET", { fields: "id,from{id,name}" });
  }

  async getComment(commentId: string) {
    return this.graph<PageComment>(commentId, "GET", { fields: "id,parent{id}" });
  }

  async publishText(pageId: string, message: string) {
    return this.graph<{ id: string }>(`${pageId}/feed`, "POST", {
      message,
      published: "true",
    });
  }

  async publishPhoto(pageId: string, message: string, imageUrl: string) {
    return this.graph<{ id?: string; post_id?: string }>(`${pageId}/photos`, "POST", {
      url: imageUrl,
      caption: message,
      published: "true",
    });
  }

  async replyToComment(commentId: string, message: string) {
    return this.graph<{ id: string }>(`${commentId}/comments`, "POST", { message });
  }

  async setCommentHidden(commentId: string, isHidden: boolean) {
    return this.graph<{ success?: boolean }>(commentId, "POST", {
      is_hidden: String(isHidden),
    });
  }

  async deletePost(postId: string) {
    return this.graph<{ success?: boolean }>(postId, "DELETE");
  }
}
