import {WebClient, WebAPICallResult} from '@slack/web-api';
const fetch = require('node-fetch');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({path: `.env.${process.env.NODE_ENV}`});
}

export interface SlackUser {
  id: string;
  name: string;
  email: string;
}

export interface JiraUser {
  username: string;
  accountId: string;
}

export async function lookupSlackUserMail(userId: string): Promise<SlackUser> {
  const web = new WebClient(process.env.SLACK_OAT_TOKEN);
  const webresp: WebAPICallResult = await web.users.identity({id: `${userId}`});
  if (webresp.ok === false) {
    console.log(webresp.error);
    throw new Error(webresp.error);
  }
  const user = webresp.user as SlackUser;
  return user;
}

export function findJiraUserByName<T>(userName: string): Promise<T> {
  const jiraUser: string = process.env.JIRA_USER!;
  const url =
    process.env.DOMAIN + 'rest/api/3/user/bulk/migration?username=' + userName;
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(jiraUser).toString('base64')}`,
      Accept: 'application/json',
    },
  }).then(
    (response: {
      ok: any;
      statusText: string | undefined;
      status: any;
      json: () => Promise<T>;
    }) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      console.log(
        `Find user by Name response: ${response.status} ${response.statusText}`
      );
      return response.json() as Promise<T>;
    }
  );
}

export async function getJiraUserId(userEmail: string): Promise<string> {
  const userName = userEmail.split('@')[0];
  const userList: JiraUser[] = await findJiraUserByName(userName);
  const user = userList[0].accountId;
  return Object.is(user, 'unknown') ? '5e684d1084dcfc0cf39137f0' : user;
}

export async function slackIdToJiraId(slackId: string): Promise<string> {
  const slackUserResp: SlackUser = await lookupSlackUserMail(slackId);
  const userEmail: string = slackUserResp.email;
  return await getJiraUserId(userEmail);
}

async function fetchComponents<T>(): Promise<T> {
  const domain: string = process.env.DOMAIN!;
  const projectId: string = process.env.PROJECT_ID!;
  const jiraUser: string = process.env.JIRA_USER!;
  const url = domain + 'rest/api/3/project/' + projectId + '/components';

  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(jiraUser).toString('base64')}`,
      Accept: 'application/json',
    },
  }).then(
    (response: {
      ok: any;
      status: any;
      statusText: any;
      json: () => Promise<T>;
    }) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      console.log(
        `fetch components response: ${response.status} ${response.statusText}`
      );
      return response.json() as Promise<T>;
    }
  );
}

export interface ComponentResp {
  self?: string;
  id: string;
  name?: string;
  description?: string;
  lead?: {
    self?: string;
    key?: string;
    accountId?: string;
    name?: string;
    avatarUrls?: object;
    displayName?: string;
    active?: boolean;
  };
  assigneeType?: string;
  assignee?: {
    self?: string;
    key?: string;
    accountId?: string;
    name?: string;
    avatarUrls?: object;
    displayName?: string;
    active?: boolean;
  };
  realAssigneeType?: string;
  realAssignee?: {
    self?: string;
    key?: string;
    accountId?: string;
    name?: string;
    avatarUrls?: object;
    displayName?: string;
    active?: boolean;
  };
  isAssigneeTypeValid?: boolean;
  project: string;
  projectId: number;
}

export async function createComponents<T>(componentsName: string): Promise<T> {
  const domain: string = process.env.DOMAIN!;
  const jiraUser: string = process.env.JIRA_USER!;
  const projectKey: string = process.env.PROJECT_KEY!;
  const url = domain + 'rest/api/3/component';
  const bodyData = `{
  "isAssigneeTypeValid": false,
  "name": "${componentsName}",
  "description": "${componentsName}",
  "project": "${projectKey}",
  "assigneeType": "UNASSIGNED"
}`;
  console.log(bodyData);
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(jiraUser).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: bodyData,
  }).then(
    (response: {
      ok: any;
      statusText: string | undefined;
      status: any;
      json: () => Promise<T>;
    }) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      console.log(
        `Create component response: ${response.status} ${response.statusText} ${response}`
      );
      return response.json() as Promise<T>;
    }
  );
}

export async function getOrCreateComponent(
  componentName: string
): Promise<string> {
  const componentsList: ComponentResp[] = await fetchComponents();
  const components = componentsList.filter(
    component => component.name === componentName
  );

  if (components === undefined || components.length === 0) {
    console.log('Create new component: ' + componentName);
    const comReps: ComponentResp = await createComponents(componentName);
    return comReps.id;
  } else {
    return components[0].id;
  }
}

export interface slackForm {
  taskName: string;
  taskSummary: string;
  duedate: string;
  reporter: string;
  assignee: string;
  component: string;
}

export async function _createIssue<T>(payload: slackForm): Promise<T> {
  const projectId = process.env.PROJECT_ID;
  const jiraUser: string = process.env.JIRA_USER!;
  const domain: string = process.env.DOMAIN!;
  const url = domain + 'rest/api/3/issue';
  const taskName = payload.taskName;
  const taskSummary = payload.taskSummary;
  const duedate = payload.duedate;
  const reporter = payload.reporter;
  const assignee = payload.assignee;
  const component = payload.component;

  const bodyData = `{
  "update": {},
  "fields": {
    "summary": "${taskName}",
    "issuetype": {
      "id": "3"
    },
    "components": [
      {
        "id": "${component}"
      }
    ],
    "project": {
      "id": "${projectId}"
    },
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "text": "${taskSummary}",
              "type": "text"
            }
          ]
        }
      ]
    },
    "duedate": "${duedate}",
    "reporter": {
      "id": "${reporter}"
    },
    "assignee": {
      "id": "${assignee}"
    }
  }
}`;

  console.log(bodyData);

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(jiraUser).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: bodyData,
  }).then(
    (response: {
      ok: any;
      statusText: string | undefined;
      status: any;
      json: () => Promise<T>;
    }) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      console.log(
        `Create Issue Response: ${response.status} ${response.statusText}`
      );
      return response.json();
    }
  );
}
