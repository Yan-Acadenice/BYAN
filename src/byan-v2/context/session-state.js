const crypto = require('crypto');

class SessionState {
  constructor() {
    this.sessionId = crypto.randomUUID();
    this.currentState = 'INTERVIEW';
    this.questionHistory = [];
    this.userResponses = [];
    this.analysisResults = {};
    this.agentProfileDraft = {};
  }

  addQuestion(question) {
    this.questionHistory.push({
      question,
      timestamp: Date.now()
    });
  }

  addResponse(questionId, response) {
    this.userResponses.push({
      questionId,
      response,
      timestamp: Date.now()
    });
  }

  setAnalysisResults(data) {
    this.analysisResults = data;
  }

  getCurrentState() {
    return this.currentState;
  }

  transitionTo(newState) {
    const validStates = ['INTERVIEW', 'ANALYSIS', 'GENERATION'];
    
    if (!validStates.includes(newState)) {
      throw new Error(`Invalid state: ${newState}`);
    }

    const validTransitions = {
      'INTERVIEW': ['ANALYSIS'],
      'ANALYSIS': ['GENERATION'],
      'GENERATION': []
    };

    if (!validTransitions[this.currentState].includes(newState)) {
      throw new Error(`Invalid state transition from ${this.currentState} to ${newState}`);
    }

    if (this.currentState === 'INTERVIEW' && newState === 'ANALYSIS') {
      if (this.userResponses.length < 5) {
        throw new Error('Cannot transition from INTERVIEW to ANALYSIS: requires at least 5 responses');
      }
    }

    if (this.currentState === 'ANALYSIS' && newState === 'GENERATION') {
      if (!this.analysisResults || Object.keys(this.analysisResults).length === 0) {
        throw new Error('Cannot transition from ANALYSIS to GENERATION: analysisResults cannot be empty');
      }
    }

    this.currentState = newState;
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      currentState: this.currentState,
      questionHistory: this.questionHistory,
      userResponses: this.userResponses,
      analysisResults: this.analysisResults,
      agentProfileDraft: this.agentProfileDraft
    };
  }

  static fromJSON(data) {
    const state = new SessionState();
    state.sessionId = data.sessionId;
    state.currentState = data.currentState;
    state.questionHistory = data.questionHistory || [];
    state.userResponses = data.userResponses || [];
    state.analysisResults = data.analysisResults || {};
    state.agentProfileDraft = data.agentProfileDraft || {};
    return state;
  }
}

module.exports = SessionState;
