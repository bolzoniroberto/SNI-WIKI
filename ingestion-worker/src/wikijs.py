"""Minimal Wiki.js GraphQL client for create/update operations."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import settings

log = logging.getLogger(__name__)


CREATE_PAGE = """
mutation CreatePage(
  $content: String!, $description: String!, $editor: String!,
  $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!,
  $path: String!, $tags: [String]!, $title: String!
) {
  pages {
    create(content: $content, description: $description, editor: $editor,
           isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale,
           path: $path, tags: $tags, title: $title) {
      responseResult { succeeded errorCode slug message }
      page { id path title }
    }
  }
}
"""

UPDATE_PAGE = """
mutation UpdatePage($id: Int!, $content: String!, $tags: [String]) {
  pages {
    update(id: $id, content: $content, tags: $tags) {
      responseResult { succeeded errorCode slug message }
      page { id path title }
    }
  }
}
"""

GET_PAGE = """
query GetPage($id: Int!) {
  pages { single(id: $id) { id path title content tags { tag } } }
}
"""

GET_PAGE_BY_PATH = """
query GetPageByPath($path: String!, $locale: String!) {
  pages { singleByPath(path: $path, locale: $locale) { id path title } }
}
"""


class WikiJSClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            base_url=settings.wikijs_url,
            headers={"Authorization": f"Bearer {settings.wikijs_token}"},
            timeout=30.0,
        )

    def _gql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        r = self._client.post(
            "/graphql",
            json={"query": query, "variables": variables},
        )
        r.raise_for_status()
        body = r.json()
        if "errors" in body:
            raise RuntimeError(f"GraphQL error: {body['errors']}")
        return body["data"]

    def get_page_id_by_path(self, path: str, locale: str = "it") -> int | None:
        try:
            data = self._gql(GET_PAGE_BY_PATH, {"path": path, "locale": locale})
            page = data["pages"]["singleByPath"]
            return page["id"] if page else None
        except Exception:  # noqa: BLE001
            return None

    def create_page(
        self,
        *,
        path: str,
        title: str,
        content: str,
        description: str = "",
        tags: list[str] | None = None,
        published: bool = False,
        locale: str = "it",
    ) -> int:
        data = self._gql(
            CREATE_PAGE,
            {
                "content": content,
                "description": description,
                "editor": "markdown",
                "isPublished": published,
                "isPrivate": False,
                "locale": locale,
                "path": path,
                "tags": tags or [],
                "title": title,
            },
        )
        result = data["pages"]["create"]
        rr = result["responseResult"]
        if not rr["succeeded"]:
            # path already exists → update instead
            if "already exists" in rr["message"]:
                existing_id = self.get_page_id_by_path(path, locale)
                if existing_id:
                    log.info("path /%s exists (id=%d); updating", path, existing_id)
                    self.update_page(existing_id, content, tags)
                    return existing_id
            raise RuntimeError(f"create_page failed: {rr['message']}")
        return result["page"]["id"]

    def update_page(self, page_id: int, content: str, tags: list[str] | None = None) -> None:
        data = self._gql(UPDATE_PAGE, {"id": page_id, "content": content, "tags": tags})
        rr = data["pages"]["update"]["responseResult"]
        if not rr["succeeded"]:
            raise RuntimeError(f"update_page failed: {rr['message']}")

    def get_page(self, page_id: int) -> dict[str, Any]:
        data = self._gql(GET_PAGE, {"id": page_id})
        return data["pages"]["single"]

    def close(self) -> None:
        self._client.close()
