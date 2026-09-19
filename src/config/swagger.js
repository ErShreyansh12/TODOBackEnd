const swaggerJsdoc = require('swagger-jsdoc');
const env = require('./env');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'TODO & Staff Task Management System API',
      version: '1.0.0',
      description: 'REST API for the TODO & Staff Task Management System.',
    },
    servers: [
      {
        url: `http://localhost:${env.port}/api/v1`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Request successful.' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Invalid email or password.' },
            errorCode: { type: 'string', example: 'INVALID_CREDENTIALS' },
          },
        },
        StaffRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6aa4036fac73e628c27d3599' },
            staffId: { type: 'string', example: 'EMP-001' },
            firstName: { type: 'string', example: 'Priya' },
            lastName: { type: 'string', example: 'Nair' },
            email: { type: 'string', nullable: true, example: 'priya.nair@example.com' },
            phone: { type: 'string', nullable: true, example: '+1 415 555 0136' },
            status: { type: 'string', example: 'active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        NoteRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6aae1234ab56cd78ef901234' },
            title: { type: 'string', example: 'Client Onboarding Checklist' },
            contentHtml: { type: 'string', example: '<p>Verify credentials before handoff.</p>' },
            pinned: { type: 'boolean', example: false },
            archived: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 42 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
