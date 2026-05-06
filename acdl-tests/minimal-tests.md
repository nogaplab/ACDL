# Minimal ACDL Tests

Tests where the agent receives only the purpose, ACDL spec, and suggested prompt. The agent must infer output format, data structures, and implementation patterns entirely from the skill file.

---

## Suggested Prompt (for all tests)

```
Generate the Python implementation for this ACDL spec. Include:
1. All template constants and template functions
2. Appropriate data classes
3. Helper functions (stubbed with TODO)
4. The complete build_messages() function with ACDL line comments
5. A usage example
```

---

# Test M1: Quiz Tutor

**Purpose:** A tutoring agent that tracks student progress, adapts difficulty based on performance, and provides hints on wrong answers.

```acdl
QuizTutor[@T]: {
    S: {
        TUTOR_PERSONA
        TEACHING_STYLE(env.subject[@1])
        DIFFICULTY_GUIDE
    }

    ForEach(@t: range(1, @T)) {
        A: {
            QUESTION_FORMAT(sys.difficulty[@t])
            resp.question[@t]
        }
        U: env.student_answer[@t]
        If sys.was_correct[@t] {
            A: resp.praise[@t]
        } Else {
            A: {
                HINT_FORMAT
                resp.hint[@t]
            }
            U: env.retry_answer[@t]
            A: resp.feedback[@t]
        }
    }

    A: {
        QUESTION_FORMAT(sys.difficulty[@T])
        resp.question[@T]
    }
}
```

---

# Test M2: Meeting Scheduler

**Purpose:** An assistant that helps schedule meetings by checking calendars, finding availability, and handling timezone conversions.

```acdl
MeetingScheduler[@T.I]: {
    S: {
        SCHEDULER_INSTRUCTIONS
        TIMEZONE_RULES
    }

    U: {
        MEETING_REQUEST
        env.meeting_details[@1]
        ForEach(attendee: env.attendees[@1]) {
            ATTENDEE_INFO(attendee.name, attendee.email, attendee.timezone)
        }
    }

    ForEach(@t: range(1, @T)) {
        ForEach(@i: range(1, @t.substeps)) {
            A: {
                resp.reasoning[@t.@i]
                ForEach(tool: sys.tool_calls[@t.@i]) {
                    tool.invocation
                }
            }
            ForEach(tool: sys.tool_calls[@t.@i]) {
                T: {
                    tool.id
                    tool.result
                }
            }
        }
        A: resp.proposal[@t]
        If sys.needs_confirmation[@t] {
            U: env.user_response[@t]
        }
    }

    If @T.I > 0 {
        ForEach(@i: range(1, @T.I)) {
            A: {
                resp.reasoning[@T.@i]
                ForEach(tool: sys.tool_calls[@T.@i]) {
                    tool.invocation
                }
            }
            ForEach(tool: sys.tool_calls[@T.@i]) {
                T: {
                    tool.id
                    tool.result
                }
            }
        }
    }
}
```

---

# Test M3: Legal Document Analyzer

**Purpose:** An agent that analyzes legal documents, extracts key clauses, identifies risks, and answers questions with citations.

```acdl
LegalAnalyzer[@T]: {
    S: {
        LEGAL_DISCLAIMER
        ANALYSIS_GUIDELINES
        CITATION_FORMAT
    }

    Name doc := parse_document(env.document[@1])
    U: {
        DOCUMENT_HEADER
        $doc.full_text
        SECTIONS_HEADER
        ForEach(section: $doc.sections) {
            SECTION_BLOCK(section.number, section.title, section.content)
        }
    }

    A: {
        INITIAL_ANALYSIS_HEADER
        resp.summary[@1]
        RISK_HEADER
        ForEach(risk: resp.identified_risks[@1]) {
            RISK_ITEM(risk.severity, risk.description, risk.clause_ref)
        }
    }

    ForEach(@t: range(2, @T)) {
        U: env.question[@t]
        A: {
            resp.answer[@t]
            If sys.has_citations[@t] {
                CITATION_HEADER
                ForEach(cite: sys.citations[@t]) {
                    cite.reference
                }
            }
        }
    }

    U: env.question[@T]
}
```

---

# Test M4: Data Pipeline Monitor

**Purpose:** An agent monitoring data pipelines with alerts, providing status summaries, and supporting drill-down queries with historical context.

```acdl
PipelineMonitor[@T]: {
    S: {
        MONITORING_ROLE
        ALERT_SEVERITY_GUIDE
        RESPONSE_PROTOCOL
    }

    Name W := sys.context_window[@T]
    If @$W > 1 {
        A: CONTEXT_SUMMARY_HEADER
        A: sys.summarized_history[@$W]
    }

    ForEach(@t: range(@$W, @T)) {
        U: {
            STATUS_REQUEST
            env.query[@t]
        }

        Name status := get_pipeline_status(env.pipeline_id[@t])
        A: {
            STATUS_HEADER
            PIPELINE_STATUS($status.name, $status.state, $status.last_run)

            If $status.has_alerts {
                ALERTS_HEADER
                ForEach(alert: $status.active_alerts) {
                    ALERT_ITEM(alert.level, alert.message, alert.timestamp)
                }
            }

            Switch $status.state {
                Case "failed": {
                    FAILURE_ANALYSIS
                    resp.failure_explanation[@t]
                }
                Case "degraded": {
                    DEGRADATION_NOTICE
                    resp.degradation_details[@t]
                }
                Default: {
                    resp.summary[@t]
                }
            }
        }
    }

    U: {
        STATUS_REQUEST
        env.query[@T]
    }
}
```

---

# Test M5: Multi-Agent Debate

**Purpose:** A debate system with a moderator and two debaters (pro/con) that take turns presenting arguments on a topic.

```acdl
Moderator[@round]: {
    S: {
        MODERATOR_ROLE
        DEBATE_RULES
        TOPIC_INTRO(env.topic[@1])
    }
    ForEach(@r: range(1, @round)) {
        A: resp.round_intro[@r]
    }
    A: resp.round_intro[@round]
}

Debater[@round](side, opponent_args): {
    S: {
        DEBATER_ROLE(side)
        ARGUMENT_STRUCTURE
    }
    If @round > 1 {
        U: {
            OPPONENT_SUMMARY
            opponent_args
        }
    }
    ForEach(@r: range(1, @round)) {
        A: resp.argument[@r]
    }
}

DebateSession[@T]: {
    Moderator[@1]

    ForEach(@t: range(1, @T)) {
        // Pro argues
        Name pro_args := resp.pro_argument[@t]
        Debater[@t]("pro", sys.con_arguments[@t])

        // Con responds
        Name con_args := resp.con_argument[@t]
        Debater[@t]("con", $pro_args)

        // Moderator transitions
        Moderator[@t]
    }

    // Final round
    Debater[@T]("pro", sys.con_arguments[@T])
    Debater[@T]("con", sys.pro_arguments[@T])

    // Closing
    S: CLOSING_INSTRUCTIONS
    U: SUMMARIZE_REQUEST
}
```

---

# Evaluation Criteria

Since these are minimal tests, evaluation focuses on whether the agent correctly inferred:

1. **Data structures** - Did it create appropriate dataclasses based on ACDL variables?
2. **Template detection** - Did it identify ALL_CAPS items as templates and create constants/functions?
3. **Control flow** - Did it correctly translate ForEach, If/Else, Switch/Case?
4. **Index handling** - Did it correctly translate @t, @T, @t.@i indices?
5. **Variable handling** - Did it correctly handle Name assignments and $ references?
6. **Message structure** - Did it produce correct role mappings (S/U/A/T)?
7. **Completeness** - Did it implement every line of the ACDL spec?
