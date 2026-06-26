import { useState } from "react"
import {
  Copy,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react"

import { Button } from "../components/ui/Button"
import { getRenderablePluginUi } from "../plugins/pluginUi"

export function WorkbenchPage() {
  const [dismissed, setDismissed] = useState<string[]>([])
  const responseCards = getRenderablePluginUi("agent.responseCard")

  return (
    <section className="workbench-page" aria-label="Bare CRM workbench">
      <header className="chat-titlebar">
        <div className="chat-title">
          <MessageCircle size={18} />
          <span>Write emails to stalled deals</span>
          <MoreHorizontal size={17} />
        </div>
        <Button variant="secondary">
          <MessageCircle size={16} />
          New chat
        </Button>
      </header>

      <div className="transcript">
        <div className="prompt-bubble">
          write emails to stalled deals that showed interest after a demo
        </div>

        <article className="assistant-turn">
          <div className="assistant-name">
            <Sparkles size={15} />
            <span>Bare CRM</span>
          </div>
          <span className="run-state">Ran code and retrieved data</span>
          <p>
            I searched your pipeline for deals that went quiet after a demo in the last 30 days. 4
            accounts showed genuine interest but have not responded since. I drafted personalized
            follow-ups based on what was discussed in each demo:
          </p>

          {responseCards.map(({ contribution, registry }) =>
            registry.responseCard
              ? (
                <registry.responseCard
                  key={`${contribution.pluginId}:${contribution.id}`}
                  contribution={contribution}
                  context={{
                    dismissedIds: dismissed,
                    onDismiss: (id) => setDismissed((items) => [...items, id]),
                  }}
                />
              )
              : null
          )}

          <div className="turn-actions">
            <button type="button" aria-label="Copy response" title="Copy response">
              <Copy size={16} />
            </button>
            <button type="button" aria-label="Regenerate" title="Regenerate">
              <RotateCcw size={16} />
            </button>
            <button type="button" aria-label="Comment" title="Comment">
              <MessageCircle size={16} />
            </button>
          </div>
        </article>
      </div>

      <form className="command-composer">
        <input aria-label="Ask Bare CRM" placeholder="Ask Bare CRM" />
        <button type="button" aria-label="Attach file" title="Attach file">
          <Paperclip size={17} />
        </button>
        <button type="submit" aria-label="Send prompt" title="Send prompt">
          <Send size={17} />
        </button>
      </form>
    </section>
  )
}
