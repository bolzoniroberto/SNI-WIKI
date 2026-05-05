import { GraphQLClient, gql } from "graphql-request";
import { config } from "./config.js";

const client = new GraphQLClient(`${config.wikijsUrl}/graphql`, {
  headers: { Authorization: `Bearer ${config.wikijsToken}` },
});

const SEARCH = gql`
  query Search($query: String!) {
    pages {
      search(query: $query) {
        results { id title path description }
      }
    }
  }
`;

const GET_PAGE = gql`
  query GetPage($id: Int!) {
    pages { single(id: $id) { id path title content tags { tag } } }
  }
`;

const UPDATE_PAGE = gql`
  mutation UpdatePage($id: Int!, $content: String!) {
    pages {
      update(id: $id, content: $content) {
        responseResult { succeeded errorCode message }
      }
    }
  }
`;

export interface SearchResult {
  id: number;
  title: string;
  path: string;
  description: string;
}

export interface Page {
  id: number;
  path: string;
  title: string;
  content: string;
  tags: { tag: string }[];
}

export async function searchPages(query: string): Promise<SearchResult[]> {
  const data = await client.request<{
    pages: { search: { results: SearchResult[] } };
  }>(SEARCH, { query });
  return data.pages.search.results;
}

export async function getPage(id: number): Promise<Page> {
  const data = await client.request<{ pages: { single: Page } }>(GET_PAGE, { id });
  return data.pages.single;
}

export async function updatePage(id: number, content: string): Promise<void> {
  const data = await client.request<{
    pages: { update: { responseResult: { succeeded: boolean; message: string } } };
  }>(UPDATE_PAGE, { id, content });
  const rr = data.pages.update.responseResult;
  if (!rr.succeeded) throw new Error(`updatePage: ${rr.message}`);
}
