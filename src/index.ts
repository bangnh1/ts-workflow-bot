import {App} from '@slack/bolt';
// eslint-disable-next-line node/no-extraneous-import
import {View, Option} from '@slack/web-api';
import {format} from 'date-fns';
import * as thirdPartyApi from './api';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({path: `.env.${process.env.NODE_ENV}`});
}

const slackConfig: {} = {
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: process.env.SLACK_LOG_LEVEL || 'debug',
};

const app = new App(slackConfig);

app.message('hello', async ({message, say}) => {
  // say() sends a message to the channel where the event was triggered
  if (message.subtype === undefined) {
    await say(`Hey there <@${message.user}>!`);
  } else {
    await say("I'm here!");
  }
});

function createOptionProjectList() {
  const projectList: string[] = [
    'AWS',
    'GG',
    'Local',
    'Others',
  ];

  const optionProjectList: Option[] = projectList.map(
    (textValue: string, index: number) => ({
      text: {
        type: 'plain_text',
        text: textValue,
      },
      value: 'value-' + index.toString(),
    })
  );

  return optionProjectList;
}

// The open_modal shortcut opens a plain old modal
app.shortcut('reportTask', async ({shortcut, ack, client}) => {
  try {
    // Acknowledge shortcut request
    await ack();
    const optionProject: Option[] = createOptionProjectList();

    const viewData: View = {
      title: {
        type: 'plain_text',
        text: 'Request Form',
        emoji: true,
      },
      submit: {
        type: 'plain_text',
        text: 'Submit',
        emoji: true,
      },
      type: 'modal',
      callback_id: 'reportTask',
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true,
      },
      blocks: [
        {
          type: 'input',
          block_id: 'taskName',
          element: {
            type: 'plain_text_input',
            max_length: 255,
            action_id: 'taskName-action',
          },
          label: {
            type: 'plain_text',
            text: 'Task Name',
            emoji: true,
          },
        },
        {
          type: 'input',
          block_id: 'taskSummary',
          element: {
            type: 'plain_text_input',
            multiline: true,
            max_length: 3000,
            action_id: 'taskSummary-action',
          },
          label: {
            type: 'plain_text',
            text: 'Task Summary',
            emoji: true,
          },
        },
        {
          type: 'section',
          block_id: 'project',
          text: {
            type: 'mrkdwn',
            text: '*Project*',
          },
          accessory: {
            type: 'static_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select an item',
              emoji: true,
            },
            options: optionProject,
            action_id: 'project-action',
          },
        },
        {
          type: 'section',
          block_id: 'assignee',
          text: {
            type: 'mrkdwn',
            text: '*Assignee*',
          },
          accessory: {
            type: 'users_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select a user',
              emoji: true,
            },
            action_id: 'assignee-action',
          },
        },
        {
          type: 'section',
          block_id: 'dateline',
          text: {
            type: 'mrkdwn',
            text: '*Pick a date for the deadline.*',
          },
          accessory: {
            type: 'datepicker',
            placeholder: {
              type: 'plain_text',
              text: 'Select a date',
              emoji: true,
            },
            action_id: 'dateline-action',
          },
        },
      ],
    };

    // Call the views.open method using one of the built-in WebClients
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: viewData,
    });
  } catch (error) {
    console.error(error);
  }
});

function getNextWeekTime(): string {
  const today: Date = new Date();
  const DATE_FORMAT = 'yyyy-MM-dd';
  const nextWeekTime = today.setDate(today.getDate() + 7).valueOf();
  return format(new Date(nextWeekTime), DATE_FORMAT);
}

function validDateTime(date: string) {
  const DATE_FORMAT = 'yyyy-MM-dd';
  const isValidDate: number = Date.parse(date);
  const nextWeekday: string = getNextWeekTime();
  return Object.is(isValidDate, NaN)
    ? nextWeekday
    : format(new Date(isValidDate), DATE_FORMAT);
}

// Handle a view_submission event
app.view('reportTask', async ({ack, body, view, client}) => {
  // Acknowledge the view_submission event
  await ack();

  // Message to send user
  const msg = 'Done!!!';
  const user = body['user']['id'];

  const reporterId: string = body['user']['id'];
  const assigneeAction: string =
    view['state']['values']['assignee']['assignee-action'].type;
  const taskName: string =
    view['state']['values']['taskName']['taskName-action'].value;
  const taskSummary: string =
    view['state']['values']['taskSummary']['taskSummary-action'].value;
  const reporterUser = await thirdPartyApi.slackIdToJiraId(reporterId);
  const assigneeUser = await thirdPartyApi.slackIdToJiraId(assigneeAction);
  const project = Object.is(
    view['state']['values']['project']['project-action'].selected_option,
    null
  )
    ? 'Others'
    : view['state']['values']['project']['project-action'].selected_option.text
        .text;
  const deadline: string = validDateTime(
    view['state']['values']['dateline']['dateline-action'].selected_date
  );
  const componentId = await thirdPartyApi.getOrCreateComponent(project);
  const slackForm: thirdPartyApi.slackForm = {
    taskName: taskName,
    taskSummary: taskSummary,
    duedate: deadline,
    reporter: reporterUser,
    assignee: assigneeUser,
    component: componentId,
  };

  console.log(slackForm);

  const result = await thirdPartyApi._createIssue(slackForm);
  console.log(result);

  // Message the user
  try {
    await client.chat.postMessage({
      channel: user,
      text: msg,
    });
  } catch (error) {
    console.error(error);
  }
});

app.action('project-action', async ({ack}) => {
  // Acknowledge the button request
  await ack();
});

app.action('assignee-action', async ({ack}) => {
  // Acknowledge the button request
  await ack();
});

app.action('dateline-action', async ({ack}) => {
  // Acknowledge the button request
  await ack();
});

const slackPort = Number(process.env.SLACK_PORT) | 3000;
(async () => {
  // Start the app
  await app.start(slackPort);

  console.log('⚡️ Bolt app is running!');
})();
