import { Chatbot } from './chatbot'
import { Header } from './header'

export default function Page() {
  return (
    <>
      <Header />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chatbot />
      </div>
    </>
  )
}
