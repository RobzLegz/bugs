import React from 'react'

const page = () => {
  return (
    <div className='w-full h-screen bg-black flex items-center justify-center'>
        <div className="w-10 h-10 border-2 border-white"></div>

        <div className="w-full max-w-86 h-16 grid grid-cols-6 fixed bottom-8 left-1/2 -translate-x-1/2">
            <div className="w-full h-full border-r-2 border-y-2 border-l-2 border-white"></div>
            <div className="w-full h-full border-r-2 border-y-2 border-white"></div>
            <div className="w-full h-full border-r-2 border-y-2 border-white"></div>
            <div className="w-full h-full border-r-2 border-y-2 border-white"></div>
            <div className="w-full h-full border-r-2 border-y-2 border-white"></div>
            <div className="w-full h-full border-r-2 border-y-2 border-white"></div>
        </div>
    </div>
  )
}

export default page