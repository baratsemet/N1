import React from 'react'
import {
  Event,
  Actions,
  Calendar,
  APIError,
  NylasAPI,
  DraftStore,
  DatabaseStore,
} from 'nylas-exports'
import {RetinaImg} from 'nylas-component-kit'
import {PLUGIN_ID, PLUGIN_NAME} from '../scheduler-constants'

import moment from 'moment'
// moment-round upon require patches `moment` with new functions.
require('moment-round')

export default class SchedulerComposerButton extends React.Component {
  static displayName = "SchedulerComposerButton";

  static propTypes = {
    draftClientId: React.PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {enabled: false};
    this._session = null;
    this._mounted = false;
    this._unsubscribes = [];
  }

  componentDidMount() {
    this._mounted = true;
    this.handleProps()
  }

  componentWillReceiveProps(newProps) {
    this.handleProps(newProps);
  }

  handleProps(newProps = null) {
    const props = newProps || this.props;
    DraftStore.sessionForClientId(props.draftClientId).then(session => {
      // Only run if things are still relevant: component is mounted
      // and draftClientIds still match
      const idIsCurrent = newProps ? true : this.props.draftClientId === session.draftClientId;
      if (this._mounted && idIsCurrent) {
        this._session = session;
        const unsub = session.listen(this._onDraftChange.bind(this));
        this._unsubscribes.push(unsub);
        this._onDraftChange();
      }
    });
  }

  _onDraftChange() {
    this.setState({enabled: this._hasPendingEvent()});
  }

  _hasPendingEvent() {
    const metadata = this._session.draft().metadataForPluginId(PLUGIN_ID);
    return metadata && metadata.pendingEvent
  }

  _onClick = () => {
    if (!this._session) { return }
    const draft = this._session.draft()
    NylasAPI.authPlugin(PLUGIN_ID, PLUGIN_NAME, draft.accountId)
    .then(() => {
      DatabaseStore.findAll(Calendar, {accountId: draft.accountId})
      .then((allCalendars) => {
        if (allCalendars.length === 0) {
          throw new Error(`Can't create an event. The Account \
${draft.accountId} has no calendars.`);
        }

        const cals = allCalendars.filter(c => !c.readOnly);

        if (cals.length === 0) {
          NylasEnv.showErrorDialog(`This account has no editable \
calendars. We can't create an event for you. Please make sure you have an \
editable calendar with your account provider.`);
          return;
        }

        const start = moment().ceil(30, 'minutes');
        const metadata = draft.metadataForPluginId(PLUGIN_ID) || {};
        metadata.uid = draft.clientId;
        metadata.pendingEvent = new Event({
          calendarId: cals[0].id,
          start: start.unix(),
          end: moment(start).add(1, 'hour').unix(),
        }).toJSON();
        Actions.setMetadata(draft, PLUGIN_ID, metadata);
      })
    }).catch((error) => {
      let title = "Error"
      let msg = `Unfortunately scheduling is not currently available. \
Please try again later.\n\nError: ${error}`
      if (!(error instanceof APIError)) {
        NylasEnv.reportError(error);
      } else if (error.statusCode === 400) {
        NylasEnv.reportError(error);
      } else if (NylasAPI.TimeoutErrorCodes.includes(error.statusCode)) {
        title = "Offline"
        msg = `Scheduling does not work offline. Please try again when you come back online.`
      }
      NylasEnv.showErrorDialog({title, message: msg});
    })
  }

  render() {
    return (
      <button className={`btn btn-toolbar ${this.state.enabled ? "btn-enabled" : ""}`}
        onClick={this._onClick}
        title="Add an event…"
      >
      <RetinaImg url="nylas://composer-scheduler/assets/ic-composer-scheduler@2x.png"
        mode={RetinaImg.Mode.ContentIsMask}
      />
    </button>)
  }
}