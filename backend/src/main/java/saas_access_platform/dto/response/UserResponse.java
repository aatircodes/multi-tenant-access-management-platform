package saas_access_platform.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class UserResponse {
    private Long id;
    private String email;
    private String status;
    private List<String> roles;
    private LocalDateTime createdAt;
}